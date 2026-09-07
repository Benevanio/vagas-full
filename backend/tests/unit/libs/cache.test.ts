import { createClient } from "redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheAbsoluteSCard,
  cacheAbsoluteSMembers,
  cacheDel,
  cacheGet,
  cacheGetJobsByIds,
  cacheJobIndexKeys,
  cachePing,
  cacheClearJobs,
  cacheSearchJobIds,
  cacheSearchKeywords,
  cacheSet,
  closeCache,
  getCache,
  invalidateUser,
} from "../../../src/lib/cache"; // Ajuste o caminho se necessário conforme sua estrutura

// Mock do logger para não sujar o console durante os testes
vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const metricMocks = vi.hoisted(() => ({
  cacheInc: vi.fn(),
}));

vi.mock("../../../src/metrics/metrics", () => ({
  cacheOperationsTotal: {
    inc: metricMocks.cacheInc,
  },
}));

// Mock do pacote redis
vi.mock("redis", () => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sMembers: vi.fn(),
    sCard: vi.fn(),
    sUnion: vi.fn(),
    sendCommand: vi.fn(),
    expire: vi.fn(),
    mGet: vi.fn(),
    ping: vi.fn(),
    withAbortSignal: vi.fn(),
  };
  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("Valkey Cache Lib", () => {
  let mockClientInstance: any;

  beforeEach(() => {
    vi.stubEnv("VALKEY_URL", "redis://localhost:6379");
    mockClientInstance = createClient();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await closeCache();
  });

  describe("Gerenciamento de Conexão", () => {
    it("deve lançar erro se VALKEY_URL não estiver definida", async () => {
      vi.stubEnv("VALKEY_URL", "");
      await expect(getCache()).rejects.toThrow(
        "VALKEY_URL environment variable is not set",
      );
    });

    it("deve criar e conectar o cliente com sucesso", async () => {
      const client = await getCache();
      expect(createClient).toHaveBeenCalledWith({
        url: "redis://localhost:6379",
      });
      expect(client.connect).toHaveBeenCalled();
    });
  });

  describe("Operações Básicas (GET, SET, DEL)", () => {
    it("deve buscar um valor parseado como JSON no cacheGet", async () => {
      mockClientInstance.get.mockResolvedValue(
        JSON.stringify({ id: 1, name: "Test" }),
      );

      const result = await cacheGet<{ id: number; name: string }>(
        "profile:123",
      );

      expect(mockClientInstance.get).toHaveBeenCalledWith("user:profile:123");
      expect(result).toEqual({ id: 1, name: "Test" });
      expect(metricMocks.cacheInc).toHaveBeenCalledWith({
        operation: "get",
        result: "hit",
      });
    });

    it("deve retornar uma string pura se falhar no JSON.parse", async () => {
      mockClientInstance.get.mockResolvedValue("string_pura");
      const result = await cacheGet("profile:123");
      expect(result).toBe("string_pura");
    });

    it("deve registrar miss no cacheGet quando a chave nao existir", async () => {
      mockClientInstance.get.mockResolvedValue(null);

      const result = await cacheGet("profile:missing");

      expect(result).toBeNull();
      expect(metricMocks.cacheInc).toHaveBeenCalledWith({
        operation: "get",
        result: "miss",
      });
    });

    it("deve salvar com TTL se fornecido", async () => {
      await cacheSet("profile:123", { role: "developer" }, 60);
      expect(mockClientInstance.set).toHaveBeenCalledWith(
        "user:profile:123",
        JSON.stringify({ role: "developer" }),
        { EX: 60 },
      );
      expect(metricMocks.cacheInc).toHaveBeenCalledWith({
        operation: "set",
        result: "ok",
      });
    });

    it("deve salvar sem TTL se o valor for menor ou igual a 0", async () => {
      await cacheSet("profile:123", "dados", 0);
      expect(mockClientInstance.set).toHaveBeenCalledWith(
        "user:profile:123",
        "dados",
      );
    });

    it("deve deletar uma chave no cacheDel", async () => {
      await cacheDel("profile:123");
      expect(mockClientInstance.del).toHaveBeenCalledWith("user:profile:123");
      expect(metricMocks.cacheInc).toHaveBeenCalledWith({
        operation: "delete",
        result: "ok",
      });
    });
  });

  describe("Invalidação de Usuário", () => {
    it("deve limpar o perfil e as preferências simultaneamente", async () => {
      await invalidateUser("user_xyz");
      expect(mockClientInstance.del).toHaveBeenCalledWith(
        "user:profile:user_xyz",
      );
      expect(mockClientInstance.del).toHaveBeenCalledWith(
        "user:preferences:user_xyz",
      );
    });
  });

  describe("Operações Absolutas e Avançadas", () => {
    it("deve buscar membros de um Set sem injetar o namespace user:", async () => {
      mockClientInstance.sMembers.mockResolvedValue(["id_1", "id_2"]);
      const result = await cacheAbsoluteSMembers("scraper:jobs:custom_key");

      expect(mockClientInstance.sMembers).toHaveBeenCalledWith(
        "scraper:jobs:custom_key",
      );
      expect(result).toEqual(["id_1", "id_2"]);
    });

    it("deve contar membros de um Set sem injetar o namespace user:", async () => {
      mockClientInstance.sCard.mockResolvedValue(42);

      const result = await cacheAbsoluteSCard("scraper:jobs:index");

      expect(mockClientInstance.sCard).toHaveBeenCalledWith(
        "scraper:jobs:index",
      );
      expect(result).toBe(42);
    });
  });

  describe("Readiness", () => {
    it("associa o sinal de cancelamento ao PING quando informado", async () => {
      const controller = new AbortController();
      const abortableClient = { ping: vi.fn().mockResolvedValue("PONG") };
      mockClientInstance.withAbortSignal.mockReturnValue(abortableClient);

      await expect(cachePing({ signal: controller.signal })).resolves.toBe("PONG");

      expect(mockClientInstance.withAbortSignal).toHaveBeenCalledWith(
        controller.signal,
      );
      expect(abortableClient.ping).toHaveBeenCalledOnce();
    });
  });

  describe("cacheSearchKeywords", () => {
    it("deve retornar array vazio se nenhuma keyword for passada", async () => {
      const result = await cacheSearchKeywords([]);
      expect(result).toEqual([]);
    });

    it("deve normalizar e buscar aliases de uma keyword válida", async () => {
      mockClientInstance.sUnion.mockResolvedValue(["job_1"]);

      const result = await cacheSearchKeywords(["  UX/UI Designer  "]);

      // "UX/UI Designer" -> "ux ui designer"
      expect(mockClientInstance.sUnion).toHaveBeenCalledWith([
        "scraper:jobs:keyword:ux ui designer",
        "scraper:jobs:technology:ux ui designer",
        "scraper:jobs:family:ux ui designer",
        "scraper:jobs:keyword:ux",
        "scraper:jobs:technology:ux",
        "scraper:jobs:family:ux",
        "scraper:jobs:keyword:ui",
        "scraper:jobs:technology:ui",
        "scraper:jobs:family:ui",
        "scraper:jobs:keyword:designer",
        "scraper:jobs:technology:designer",
        "scraper:jobs:family:designer",
      ]);
      expect(result).toEqual(["job_1"]);
    });

    it("deve aplicar SUNION se houver múltiplas keywords válidas", async () => {
      mockClientInstance.sUnion.mockResolvedValue(["job_1", "job_2"]);

      const result = await cacheSearchKeywords(["Go", "C#", "   "]); // O espaço em branco deve ser ignorado

      expect(mockClientInstance.sUnion).toHaveBeenCalledWith([
        "scraper:jobs:keyword:go",
        "scraper:jobs:technology:go",
        "scraper:jobs:family:go",
        "scraper:jobs:keyword:c#",
        "scraper:jobs:technology:c#",
        "scraper:jobs:family:c#",
        "scraper:jobs:keyword:c",
        "scraper:jobs:technology:c",
        "scraper:jobs:family:c",
      ]);
      expect(result).toEqual(["job_1", "job_2"]);
    });
  });

  describe("cacheSearchJobIds", () => {
    it("deve montar chaves normalizadas para filtros estruturados", () => {
      expect(
        cacheJobIndexKeys({
          family: "Front-end",
          technology: "React Native",
          seniority: "Sênior",
          level: "Júnior",
          location: "Brasil",
          type: "Híbrido",
          contract: "PJ",
        }),
      ).toEqual([
        "scraper:jobs:family:front end",
        "scraper:jobs:technology:react native",
        "scraper:jobs:seniority:senior",
        "scraper:jobs:level:junior",
        "scraper:jobs:location:brasil",
        "scraper:jobs:model:hibrido",
        "scraper:jobs:contract:pj",
      ]);
    });

    it("deve normalizar estágio/trainee para o índice interno de estágio", () => {
      expect(cacheJobIndexKeys({ level: "Estágio/Trainee" })).toEqual([
        "scraper:jobs:level:estagio",
      ]);
      expect(cacheJobIndexKeys({ level: "Trainee" })).toEqual([
        "scraper:jobs:level:estagio",
      ]);
    });

    it("deve usar índice global quando não houver keywords nem filtros", async () => {
      mockClientInstance.sMembers.mockResolvedValue(["job_1"]);

      const result = await cacheSearchJobIds({});

      expect(mockClientInstance.sMembers).toHaveBeenCalledWith(
        "scraper:jobs:index",
      );
      expect(result).toEqual(["job_1"]);
    });

    it("deve intersectar keyword única com filtros estruturados", async () => {
      mockClientInstance.sendCommand.mockResolvedValue(["job_1"]);

      const result = await cacheSearchJobIds({
        keywords: ["Node.js"],
        level: "Sênior",
        country: "Brasil",
        model: "Remoto",
      });

      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(1, [
        "SUNIONSTORE",
        expect.stringMatching(/^scraper:jobs:search:/),
        "scraper:jobs:keyword:node.js",
        "scraper:jobs:technology:node.js",
        "scraper:jobs:family:node.js",
        "scraper:jobs:keyword:node js",
        "scraper:jobs:technology:node js",
        "scraper:jobs:family:node js",
        "scraper:jobs:keyword:nodejs",
        "scraper:jobs:technology:nodejs",
        "scraper:jobs:family:nodejs",
        "scraper:jobs:keyword:node",
        "scraper:jobs:technology:node",
        "scraper:jobs:family:node",
        "scraper:jobs:keyword:js",
        "scraper:jobs:technology:js",
        "scraper:jobs:family:js",
      ]);
      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(2, [
        "SINTER",
        expect.stringMatching(/^scraper:jobs:search:/),
        "scraper:jobs:level:senior",
        "scraper:jobs:country:brasil",
        "scraper:jobs:model:remoto",
      ]);
      expect(result).toEqual(["job_1"]);
    });

    it("deve criar união temporária para múltiplas keywords antes da interseção", async () => {
      mockClientInstance.sendCommand
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(["job_1", "job_2"]);

      const result = await cacheSearchJobIds({
        keywords: ["React", "Node"],
        type: "Remoto",
      });

      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(1, [
        "SUNIONSTORE",
        expect.stringMatching(/^scraper:jobs:search:/),
        "scraper:jobs:keyword:react",
        "scraper:jobs:technology:react",
        "scraper:jobs:family:react",
        "scraper:jobs:keyword:node",
        "scraper:jobs:technology:node",
        "scraper:jobs:family:node",
      ]);
      expect(mockClientInstance.expire).toHaveBeenCalledWith(
        expect.stringMatching(/^scraper:jobs:search:/),
        30,
      );
      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(2, [
        "SINTER",
        expect.stringMatching(/^scraper:jobs:search:/),
        "scraper:jobs:model:remoto",
      ]);
      expect(mockClientInstance.del).toHaveBeenCalledWith(
        expect.stringMatching(/^scraper:jobs:search:/),
      );
      expect(result).toEqual(["job_1", "job_2"]);
    });

    it("deve unir múltiplos modelos antes de intersectar com outros filtros", async () => {
      mockClientInstance.sendCommand
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(["job_1", "job_2"]);

      const result = await cacheSearchJobIds({
        model: ["Remoto", "Híbrido"],
        level: "Sênior",
      });

      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(1, [
        "SUNIONSTORE",
        expect.stringMatching(/^scraper:jobs:filter:/),
        "scraper:jobs:model:remoto",
        "scraper:jobs:model:hibrido",
      ]);
      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(2, [
        "SINTER",
        "scraper:jobs:level:senior",
        expect.stringMatching(/^scraper:jobs:filter:/),
      ]);
      expect(mockClientInstance.del).toHaveBeenCalledWith(
        expect.stringMatching(/^scraper:jobs:filter:/),
      );
      expect(result).toEqual(["job_1", "job_2"]);
    });
  });

  describe("cacheGetJobsByIds", () => {
    it("deve retornar array vazio se nenhum ID for fornecido", async () => {
      const result = await cacheGetJobsByIds([]);
      expect(result).toEqual([]);
    });

    it("deve buscar múltiplos jobs via mGet e ignorar valores nulos ou corrompidos", async () => {
      mockClientInstance.mGet.mockResolvedValue([
        JSON.stringify({ title: "Go Dev" }),
        null,
        "invalid-json-data",
        JSON.stringify({ title: "Rust Dev" }),
      ]);

      const result = await cacheGetJobsByIds(["1", "2", "3", "4"]);

      expect(mockClientInstance.mGet).toHaveBeenCalledWith([
        "scraper:job:1",
        "scraper:job:2",
        "scraper:job:3",
        "scraper:job:4",
      ]);
      // Deve filtrar o nulo e o JSON quebrado mantendo apenas os válidos
      expect(result).toEqual([{ title: "Go Dev" }, { title: "Rust Dev" }]);
    });
  });

  describe("cacheClearJobs", () => {
    it("deve remover payloads e índices de vagas por SCAN em lotes", async () => {
      mockClientInstance.sendCommand
        .mockResolvedValueOnce(["0", ["scraper:job:1", "scraper:job:2"]])
        .mockResolvedValueOnce([
          "0",
          ["scraper:jobs:index", "scraper:jobs:keyword:node"],
        ]);
      mockClientInstance.del.mockResolvedValueOnce(2).mockResolvedValueOnce(2);

      const result = await cacheClearJobs();

      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(1, [
        "SCAN",
        "0",
        "MATCH",
        "scraper:job:*",
        "COUNT",
        "500",
      ]);
      expect(mockClientInstance.sendCommand).toHaveBeenNthCalledWith(2, [
        "SCAN",
        "0",
        "MATCH",
        "scraper:jobs:*",
        "COUNT",
        "500",
      ]);
      expect(mockClientInstance.del).toHaveBeenNthCalledWith(1, [
        "scraper:job:1",
        "scraper:job:2",
      ]);
      expect(mockClientInstance.del).toHaveBeenNthCalledWith(2, [
        "scraper:jobs:index",
        "scraper:jobs:keyword:node",
      ]);
      expect(result).toEqual({
        deleted: 4,
        patterns: ["scraper:job:*", "scraper:jobs:*"],
      });
    });

    it("não deve chamar DEL quando o SCAN não encontrar chaves", async () => {
      mockClientInstance.sendCommand
        .mockResolvedValueOnce(["0", []])
        .mockResolvedValueOnce(["0", []]);

      const result = await cacheClearJobs();

      expect(mockClientInstance.del).not.toHaveBeenCalled();
      expect(result.deleted).toBe(0);
    });
  });
});
