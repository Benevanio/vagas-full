import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedJob } from "../../../../src/db/schema";

const drizzleMocks = vi.hoisted(() => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: drizzleMocks.and,
    eq: drizzleMocks.eq,
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockJob: SavedJob = {
  id: "job-1",
  userId: "user-1",
  jobLink: "https://example.com/job/1",
  jobTitle: "Engenheiro de Software",
  company: "Empresa X",
  status: "saved",
  appliedAt: null,
  notes: null,
  location: null,
  source: null,
  keyword: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

// ─── Mock DB factory ──────────────────────────────────────────────────────────

function makeMockTx() {
  const tx: any = {
    query: {
      savedJobs: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      applicationEvents: {
        findMany: vi.fn(),
      },
    },
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  };

  tx.transaction.mockImplementation(
    async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  );

  return tx;
}

// HELPER

function mockLockedJob(
  tx: ReturnType<typeof makeMockTx>,
  job: SavedJob | undefined,
) {
  const forUpdate = vi.fn().mockResolvedValue(job ? [job] : []);

  tx.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          for: forUpdate,
        }),
      }),
    }),
  });

  return forUpdate;
}

// ─── Import after vitest setup ────────────────────────────────────────────────

// import { SavedJobsService } from "../../../../src/modules/savedJobs/savedJobs.service";
import { SavedJobsService } from "../../../../src/modules/savedJobs/savedJobs.service";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SavedJobsService", () => {
  let tx: ReturnType<typeof makeMockTx>;
  let service: SavedJobsService;

  beforeEach(() => {
    tx = makeMockTx();
    service = new SavedJobsService(tx as any);
    mockLockedJob(tx, mockJob);
    drizzleMocks.and.mockImplementation((...conditions) => conditions);
    drizzleMocks.eq.mockImplementation((column, value) => ({
      column,
      value,
    }));
  });

  // ── getAll ─────────────────────────────────────────────────────────────────

  describe("getAll", () => {
    it("retorna todas as vagas do usuário", async () => {
      tx.query.savedJobs.findMany.mockResolvedValue([mockJob]);

      const result = await service.getAll("user-1");

      expect(result).toEqual([mockJob]);
      expect(tx.query.savedJobs.findMany).toHaveBeenCalledOnce();
    });

    it("retorna array vazio quando usuário não tem vagas", async () => {
      tx.query.savedJobs.findMany.mockResolvedValue([]);

      const result = await service.getAll("user-sem-vagas");

      expect(result).toEqual([]);
    });
  });

  // ── getById ────────────────────────────────────────────────────────────────

  describe("getById", () => {
    it("retorna a vaga quando encontrada", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(mockJob);

      const result = await service.getById("user-1", "job-1");

      expect(result).toEqual(mockJob);
    });

    it("monta filtro com jobId e userId para impedir leitura cross-user", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(mockJob);

      await service.getById("user-1", "job-1");

      const where = tx.query.savedJobs.findFirst.mock.calls[0][0].where;
      const table = { userId: "savedJobs.userId", id: "savedJobs.id" };
      expect(where(table, drizzleMocks)).toEqual([
        { column: "savedJobs.userId", value: "user-1" },
        { column: "savedJobs.id", value: "job-1" },
      ]);
    });

    it("retorna undefined quando vaga não existe", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(undefined);

      const result = await service.getById("user-1", "inexistente");

      expect(result).toBeUndefined();
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe("create", () => {
    const newJobData = {
      jobLink: "https://example.com/job/new",
      title: "Dev Frontend",
      company: "Empresa Y",
    };

    it("cria e retorna a vaga quando não existe duplicata", async () => {
      const createdJob = { ...mockJob, ...newJobData };
      const savedJobValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdJob]),
      });
      const notificationValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "notification-1" }]),
      });
      const eventValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      });

      tx.query.savedJobs.findFirst.mockResolvedValue(undefined);
      tx.insert
        .mockReturnValueOnce({ values: savedJobValues })
        .mockReturnValueOnce({ values: eventValues })
        .mockReturnValueOnce({ values: notificationValues });

      const result = await service.create("user-1", newJobData);

      expect(result).toMatchObject(newJobData);
      expect(tx.insert).toHaveBeenCalledTimes(3);
      expect(savedJobValues).toHaveBeenCalledWith({
        ...newJobData,
        userId: "user-1",
      });
      expect(notificationValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          channel: "notification",
          type: "job_saved",
          entityType: "job",
          entityId: createdJob.id,
        }),
      );
      expect(eventValues).toHaveBeenCalledWith(
        expect.objectContaining({
          savedJobId: createdJob.id,
          metadata: expect.objectContaining({ event: "application_created" }),
        }),
      );
    });

    it("lança CONFLICT quando jobLink já existe para o usuário", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(mockJob);

      await expect(service.create("user-1", newJobData)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Vaga já salva.",
      });

      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("verifica duplicidade por jobLink apenas dentro do mesmo usuário", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(undefined);
      tx.insert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...mockJob, ...newJobData }]),
        }),
      });
      tx.insert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });
      tx.insert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "notification-1" }]),
        }),
      });

      await service.create("user-1", newJobData);

      const where = tx.query.savedJobs.findFirst.mock.calls[0][0].where;
      const table = {
        userId: "savedJobs.userId",
        jobLink: "savedJobs.jobLink",
      };
      expect(where(table, drizzleMocks)).toEqual([
        { column: "savedJobs.userId", value: "user-1" },
        { column: "savedJobs.jobLink", value: newJobData.jobLink },
      ]);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe("update", () => {
    it("atualiza e retorna a vaga", async () => {
      tx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "job-1",
                userId: "user-1",
                jobLink: "https://example.com/job/1",
                jobTitle: "Dev Sênior", // Força o valor correto aqui
                company: "Empresa X",
                createdAt: new Date("2024-01-01"),
                updatedAt: new Date("2024-01-01"),
              },
            ]),
          }),
        }),
      });

      const result = await service.update("user-1", "job-1", {
        jobTitle: "Dev Sênior",
      });

      expect(result.jobTitle).toBe("Dev Sênior");
    });

    it("lança NOT_FOUND quando o update não retorna linha", async () => {
      tx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        service.update("user-1", "inexistente", { jobTitle: "X" }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Vaga não encontrada",
      });
    });

    it("cria evento e notificação quando o status muda", async () => {
      const previousJob = {
        ...mockJob,
        status: "saved" as const,
      };

      const updatedJob = {
        ...mockJob,
        status: "applied" as const,
      };

      mockLockedJob(tx, previousJob);

      tx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedJob]),
          }),
        }),
      });

      const eventValues = vi.fn().mockResolvedValue(undefined);

      const notificationValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: "notification-1" },
        ]),
      });

      tx.insert
        .mockReturnValueOnce({ values: eventValues })
        .mockReturnValueOnce({ values: notificationValues });

      const result = await service.update("user-1", "job-1", {
        status: "applied",
      });

      expect(result.status).toBe("applied");

      expect(eventValues).toHaveBeenCalledWith({
        userId: "user-1",
        savedJobId: "job-1",
        type: "status_changed",
        fromStatus: "saved",
        toStatus: "applied",
      });

      expect(notificationValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          type: "job_applied",
          entityId: "job-1",
        }),
      );

      expect(tx.transaction).toHaveBeenCalledOnce();
    });

    it("não cria evento quando o status não muda", async () => {
      const appliedJob = {
        ...mockJob,
        status: "applied" as const,
      };

      mockLockedJob(tx, appliedJob);

      tx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([appliedJob]),
          }),
        }),
      });

      await service.update("user-1", "job-1", {
        status: "applied",
      });

      expect(tx.insert).not.toHaveBeenCalled();
    });

    it("inclui updatedAt no set", async () => {
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockJob]),
        }),
      });
      tx.update.mockReturnValue({ set: setMock });

      await service.update("user-1", "job-1", { jobTitle: "X" });

      const setArg = setMock.mock.calls[0][0];
      expect(setArg).toHaveProperty("updatedAt");
      expect(setArg.updatedAt).toBeInstanceOf(Date);
    });

    it("atualiza usando jobId e userId para impedir alteração cross-user", async () => {
      const whereMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockJob]),
      });
      tx.update.mockReturnValue({
        set: vi.fn().mockReturnValue({ where: whereMock }),
      });

      await service.update("user-1", "job-1", { jobTitle: "X" });

      expect(whereMock).toHaveBeenCalledWith([
        { column: expect.anything(), value: "job-1" },
        { column: expect.anything(), value: "user-1" },
      ]);
    });
  });

  // ── getEvents ──────────────────────────────────────────────────────────────

  describe("getEvents", () => {
    const events = [
      {
        id: "event-1",
        userId: "user-1",
        savedJobId: "job-1",
        type: "status_changed",
        fromStatus: "saved",
        toStatus: "applied",
        metadata: null,
        createdAt: new Date("2024-01-01"),
      },
      {
        id: "event-2",
        userId: "user-1",
        savedJobId: "job-1",
        type: "status_changed",
        fromStatus: "applied",
        toStatus: "interviewing",
        metadata: null,
        createdAt: new Date("2024-01-02"),
      },
    ];

    it("retorna somente os eventos da vaga do usuário", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(mockJob);
      tx.query.applicationEvents.findMany.mockResolvedValue(events);

      const result = await service.getEvents("user-1", "job-1");

      expect(result).toEqual(events);

      const options = tx.query.applicationEvents.findMany.mock.calls[0][0];
      const operators = {
        and: (...conditions: unknown[]) => conditions,
        eq: (column: unknown, value: unknown) => ({ column, value }),
      };
      const table = {
        userId: "applicationEvents.userId",
        savedJobId: "applicationEvents.savedJobId",
      };

      expect(options.where(table, operators)).toEqual([
        { column: "applicationEvents.userId", value: "user-1" },
        { column: "applicationEvents.savedJobId", value: "job-1" },
      ]);
    });

    it("ordena do evento mais antigo para o mais recente", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(mockJob);
      tx.query.applicationEvents.findMany.mockResolvedValue(events);

      await service.getEvents("user-1", "job-1");

      const options = tx.query.applicationEvents.findMany.mock.calls[0][0];
      const asc = vi.fn((column) => ({ direction: "asc", column }));
      const order = options.orderBy(
        {
          createdAt: "applicationEvents.createdAt",
          id: "applicationEvents.id",
        },
        { asc },
      );

      expect(order).toEqual([
        {
          direction: "asc",
          column: "applicationEvents.createdAt",
        },
        {
          direction: "asc",
          column: "applicationEvents.id",
        },
      ]);
    });

    it("não lista eventos de vaga que não pertence ao usuário", async () => {
      tx.query.savedJobs.findFirst.mockResolvedValue(undefined);

      await expect(
        service.getEvents("user-2", "job-1"),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        statusCode: 404,
      });

      expect(tx.query.applicationEvents.findMany).not.toHaveBeenCalled();
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe("delete", () => {
    it("executa delete sem lançar erro", async () => {
      tx.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "job-1" }]),
        }),
      });

      await expect(service.delete("user-1", "job-1")).resolves.toBeUndefined();
      expect(tx.delete).toHaveBeenCalledOnce();
    });

    it("deleta usando jobId e userId para impedir remoção cross-user", async () => {
      const whereMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "job-1" }]),
      });
      tx.delete.mockReturnValue({ where: whereMock });

      await service.delete("user-1", "job-1");

      expect(whereMock).toHaveBeenCalledWith([
        { column: expect.anything(), value: "job-1" },
        { column: expect.anything(), value: "user-1" },
      ]);
    });

    it("lança NOT_FOUND quando nenhuma vaga é removida", async () => {
      tx.delete.mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.delete("user-1", "job-1")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Vaga não encontrada",
      });
    });
  });
});
