# Observability — documentação técnica

Este documento descreve a observabilidade do projeto Jobs Scraper Global: métricas, logs, dashboards, alertas e como rodar/estender o stack localmente. O objetivo é ser um guia operacional e de referência para engenheiros.

## Visão Geral

- Stack real e operacional (o único que sobe hoje via Docker Compose): Prometheus (métricas) + Grafana (dashboards) + Loki (logs) + Promtail (ingestão de logs) + exporters (Postgres/Redis/node) + cAdvisor + Alertmanager — tudo definido em `docker-compose.observability.yml`.
- Configs órfãs no repositório (ELK: Elasticsearch + Filebeat + Kibana): existem apenas arquivos de configuração soltos em `observability/elasticsearch`, `observability/kibana` e `observability/filebeat`. **Nenhum desses serviços está declarado em `docker-compose.observability.yml` nem em qualquer outro `docker-compose*.yml`** — não há como "ativar" ELK apenas rodando um comando; seria necessário escrever os serviços do zero no Compose.

> Nota operacional: os arquivos de config de ELK ficam no repositório apenas como referência/planejamento futuro. A stack que roda de fato hoje é Prometheus/Grafana/Loki/Promtail, descrita abaixo.

## Arquitetura e artefatos no repositório

- Orquestração (exemplo): [docker-compose.observability.yml](docker-compose.observability.yml) — contém serviços para Prometheus, Grafana, Loki, Promtail, exporters e Alertmanager. Alguns blocos estão comentados como exemplo.
- Configurações principais:
  - Prometheus: [observability/prometheus/prometheus.yml](observability/prometheus/prometheus.yml)
  - Grafana provisioning (datasources & dashboards): [observability/grafana/provisioning](observability/grafana/provisioning)
  - Loki: [observability/loki/loki-config.yml](observability/loki/loki-config.yml)
  - Promtail: [observability/promtail/promtail.yml](observability/promtail/promtail.yml) (configuração versionada no repositório)
  - ELK (não wireado a nenhum docker-compose — apenas arquivos de config):
    - Elasticsearch: [observability/elasticsearch/elasticsearch.yml](observability/elasticsearch/elasticsearch.yml)
    - Kibana: [observability/kibana/kibana.yml](observability/kibana/kibana.yml)
    - Filebeat: [observability/filebeat/filebeat.yml](observability/filebeat/filebeat.yml)
  - Alertmanager: [observability/alertmanager/alertmanager.yml](observability/alertmanager/alertmanager.yml)

## Métricas — inventário e como expor

1) Backend (Node.js)

- Biblioteca usada: `prom-client` (ver `backend/package.json`).
- Registro central: `backend/src/metrics/metrics.ts` exporta os métricas e o `register`.
- Métricas definidas no backend:
  - `http_request_duration_seconds` (Histogram) — labels: `method`, `route`, `status_code`.
  - `http_requests_total` (Counter) — labels: `method`, `route`, `status_code`.
  - `active_sessions` (Gauge).
  - `job_searches_total` (Counter) — label: `has_keywords`.
  - `cache_operations_total` (Counter) — labels: `operation`, `result`.

- Exposição: o endpoint `/metrics` é declarado em `backend/src/app.ts` e retorna `await register.metrics()` com o Content-Type correto para Prometheus.
- Instrumentação automática: `client.collectDefaultMetrics({ register })` é chamada para métricas do processo.
- Middleware de captura de latência/contagem: `backend/src/middleware/metrics.ts` mede duração e incrementa as contagens por rota/verb/status.

Como adicionar métricas ao backend:

1. Importar a instância do `register` e criar métricas em `backend/src/metrics/metrics.ts` seguindo o padrão existente.
2. Usar `Counter.inc()`, `Gauge.set()`, `Histogram.startTimer()` conforme necessário.
3. Garantir que o `metricsMiddleware` esteja registrado (já está no app). Reiniciar a aplicação.

1) Scraper (Go)

- O scraper implementa métricas via `prometheus/client_golang` em `scraper-go/internal/metrics/metrics.go`.
- Métricas observáveis (amostra): `scraper_runs_total`, `scraper_duration_seconds`, `scraper_jobs_found_total`, `scraper_errors_total`, `scraper_pipeline_duration_seconds`, `scraper_pipeline_jobs_total`, `scraper_indexed_keywords`.
- Exposição: o serviço `scraper-go` tem seu endpoint de métricas (ver `scraper-go/cmd/server`), e o Prometheus scrape job do `prometheus.yml` aponta para `scraper-go:8081`.

## Logs — formatos e pipelines

1) Backend logging

- Biblioteca: `pino` (arquivo `backend/src/logger.ts`). Logs estruturados em JSON com timestamp ISO e campos base (`service`, `environment`).
- Prática: dentro de rotas/controllers usar `getRequestLogger` para anexar `requestId`/`userId`.

1) Logs de contêiner/infra

- Opções no repositório:
  - Loki + Promtail (preferido): Grafana já tem Loki como datasource em `observability/grafana/provisioning/datasources/datasources.yml`.
  - ELK (Filebeat → Elasticsearch → Kibana): existe `observability/filebeat/filebeat.yml` configurado para autodiscover e envio para Elasticsearch.

Observação importante: o arquivo `observability/promtail/promtail.yml` está versionado no repositório. O serviço `promtail` agora monta esse arquivo direto em `/etc/promtail/promtail.yml`, mantendo o volume nomeado apenas para o estado de posições.

Exemplo mínimo de `promtail` config (já disponível em `observability/promtail/promtail.yml`):

```yaml
server:
  http_listen_port: 9080
positions:
  filename: /tmp/positions.yaml
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: docker-logs
    pipeline_stages:
      - docker: {}
    static_configs:
      - targets: ['localhost']
        labels:
          job: docker
          __path__: /var/lib/docker/containers/*/*.log
```

Para usar Promtail com o compose já presente:

1. O arquivo `observability/promtail/promtail.yml` já está versionado no repositório.
2. O serviço `promtail` deve montar o arquivo em `/etc/promtail/promtail.yml` e usar o volume nomeado apenas para estado em `/etc/promtail/state`.

Alternativa não operacional hoje: Filebeat → Elasticsearch. O `filebeat.yml` está configurado com autodiscover e aponta para `elasticsearch:9200`, mas nenhum dos dois serviços (`filebeat`, `elasticsearch`) é declarado em `docker-compose.observability.yml` — para usar essa alternativa é preciso adicionar os serviços ao compose antes.

## Dashboards (Grafana)

- Datasources: `Prometheus` (default) e `Loki` (logs) definidas em `observability/grafana/provisioning/datasources/datasources.yml`.
- Dashboards provisionados (pasta):
  - `api-overview.json` — métricas de requests, latência, erro, buscas de vagas e cache.
  - `infra.json` — CPU/memória por container, métricas do host, Postgres, Redis.
  - `scraper-health.json` — execução do scraper, duração, vagas encontradas, erros e métricas de pipeline.
  - `business.json` — visão de negócio (buscas, vagas encontradas, cache hit rate).

Como ajustar dashboards:

1. Atualizar os JSON em `observability/grafana/provisioning/dashboards` e reiniciar Grafana (ou re-aplicar via API).
2. Se adicionar novas métricas, garantir que o Prometheus esteja coletando-as e que as queries do painel usem o nome correto.

## Alertas

- Arquivo inicial: `observability/alertmanager/alertmanager.yml` (atualmente contém um `receiver: default` sem rotas/receivers avançadas).
- Recomendações:
  - Definir regras de alerta no Prometheus (ex.: `prometheus/rules/*.yml`) e montá-las no container Prometheus.
  - Configurar `alertmanager.yml` com rotas, receivers e integrações (Slack, e-mail, PagerDuty, etc.).

## Deploy local rápido (exemplo)

1. Garantir rede Docker externa `vagas-net` (o compose referencia `external: true`). Se quiser rodar local sem rede externa, remova `external: true` e deixe o compose criar a rede.

2. Compor o stack de observability (ex.: usar o arquivo `docker-compose.observability.yml`):

```bash
docker compose -f docker-compose.observability.yml up -d
```

1. Verificações:

- Prometheus UI: <http://localhost:9091> (ou 9090 se mapear 9090:9090)
- Grafana: <http://localhost:3002>
- Loki: <http://localhost:3100>
- Kibana: não aplicável hoje — ELK não está declarado em nenhum `docker-compose*.yml` do repositório (ver seção "Visão Geral").

## Escalabilidade, retenção e custos

- Elasticsearch: exige mais RAM/IO; planejar `ES_JAVA_OPTS` e políticas de retenção/ILM antes de produção.
- Loki: usa TSDB/obj store; dependendo do backend de storage, a retenção e custos variam. Para volumes locais, definir regras de compactação e retenção.
- Prometheus: para grandes ambientes, usar fan-out remoto_write ou Cortex/Thanos para long-term storage.

## Segurança

- Prod: habilitar autenticação para Elasticsearch, Grafana, Loki e restringir acesso às portas.
- Usar TLS e autenticação no Alertmanager e nos endpoints de ingestão (Loki/API).

## Troubleshooting rápido

- Se o Prometheus não coletar métricas do `backend`:
  - Verifique se o container `backend` responde em `backend:3001/metrics` dentro da rede Docker.
  - Confirme `prometheus.yml` targets e labels.

- Se logs não aparecerem no Grafana/Loki:
  - Confirme que o `promtail` está em execução, com configuração apontando para `/var/lib/docker/containers/*/*.log` e `url: http://loki:3100`.
  - `filebeat`/ELK não é uma alternativa operacional hoje (não está no compose) — ver "Visão Geral" acima.

## Passos recomendados próximos

1. Expandir `alertmanager.yml` com rotas/receivers e criar regras de alerta no Prometheus para latência elevada, erro rate e falta de scrape.
2. Documentar políticas de retenção e backup (por exemplo: snapshots do Elasticsearch, compactação/retention para Loki).

---
