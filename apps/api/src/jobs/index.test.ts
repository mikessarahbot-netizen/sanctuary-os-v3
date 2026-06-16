import { describe, expect, it } from "vitest";
import {
  ApiJobStatusRecordSchema,
  ApiJobRequestSchema,
  createInMemoryJobDispatcher,
  validateApiJobRequest,
  validateApiJobStatusRecord
} from "./index.js";

describe("API job request schemas", () => {
  it("validates CCLI reporting jobs without accepting vendor credentials", () => {
    expect(
      ApiJobRequestSchema.parse({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        tenantId: "tenant_1"
      }).payload
    ).toEqual({
      reportingStatus: "pending",
      serviceId: "service_1"
    });

    expect(() =>
      ApiJobRequestSchema.parse({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending",
          serviceId: "service_1",
          vendorPassword: "never-enqueue-this"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        tenantId: "tenant_1"
      })
    ).toThrow();
  });

  it("rejects malformed CCLI reporting job requests", () => {
    expect(() =>
      validateApiJobRequest({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "reported",
          serviceId: "service_1"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        tenantId: "tenant_1"
      })
    ).toThrow();

    expect(() =>
      ApiJobRequestSchema.parse({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        tenantId: "tenant_1"
      })
    ).toThrow();
  });
});

describe("createInMemoryJobDispatcher", () => {
  it("validates and records job handoffs with deterministic IDs in order", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();

    await expect(
      jobDispatcher.enqueue({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting_1",
        tenantId: "tenant_1"
      })
    ).resolves.toEqual({ jobId: "job_1" });

    await expect(
      jobDispatcher.enqueue({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending",
          serviceId: "service_2"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting_2",
        tenantId: "tenant_1"
      })
    ).resolves.toEqual({ jobId: "job_2" });

    expect(
      jobDispatcher.readQueuedJobs().map((job) => ({
        jobId: job.jobId,
        requestId: job.request.requestId,
        sequence: job.sequence,
        serviceId: job.request.payload.serviceId
      }))
    ).toEqual([
      {
        jobId: "job_1",
        requestId: "request_ccli_reporting_1",
        sequence: 1,
        serviceId: "service_1"
      },
      {
        jobId: "job_2",
        requestId: "request_ccli_reporting_2",
        sequence: 2,
        serviceId: "service_2"
      }
    ]);
  });

  it("does not record malformed job requests", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();

    await expect(
      jobDispatcher.enqueue({
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        tenantId: "tenant_1"
      })
    ).rejects.toThrow();

    expect(jobDispatcher.readQueuedJobs()).toEqual([]);
  });

  it("can clear queued jobs between assertions", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();

    await jobDispatcher.enqueue({
      jobType: "ccli-reporting",
      payload: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestedByActorId: "actor_1",
      requestId: "request_ccli_reporting",
      tenantId: "tenant_1"
    });

    jobDispatcher.clear();

    expect(jobDispatcher.readQueuedJobs()).toEqual([]);
    expect(jobDispatcher.readJobStatuses()).toEqual([]);
  });

  it("exposes queued job status records for polling", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();

    await jobDispatcher.enqueue({
      jobType: "ccli-reporting",
      payload: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestedByActorId: "actor_1",
      requestId: "request_ccli_reporting",
      tenantId: "tenant_1"
    });

    const status = await jobDispatcher.getJobStatus({
      jobId: "job_1",
      requestedByActorId: "actor_1",
      requestId: "request_status",
      tenantId: "tenant_1"
    });

    expect(status).toMatchObject({
      jobId: "job_1",
      jobType: "ccli-reporting",
      payload: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestedByActorId: "actor_1",
      requestId: "request_ccli_reporting",
      sequence: 1,
      status: "queued",
      tenantId: "tenant_1"
    });
    expect(status).not.toBeNull();

    if (status === null) {
      throw new Error("Expected queued job status.");
    }

    expect(validateApiJobStatusRecord(status)).toEqual(status);
  });

  it("returns null for missing or cross-tenant job status lookups", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();

    await jobDispatcher.enqueue({
      jobType: "ccli-reporting",
      payload: {
        reportingStatus: "pending",
        serviceId: "service_1"
      },
      requestedByActorId: "actor_1",
      requestId: "request_ccli_reporting",
      tenantId: "tenant_1"
    });

    await expect(
      jobDispatcher.getJobStatus({
        jobId: "job_missing",
        requestedByActorId: "actor_1",
        requestId: "request_status",
        tenantId: "tenant_1"
      })
    ).resolves.toBeNull();
    await expect(
      jobDispatcher.getJobStatus({
        jobId: "job_1",
        requestedByActorId: "actor_2",
        requestId: "request_status",
        tenantId: "tenant_2"
      })
    ).resolves.toBeNull();
  });

  it("rejects malformed status records and lookups", async () => {
    const jobDispatcher = createInMemoryJobDispatcher();

    expect(() =>
      ApiJobStatusRecordSchema.parse({
        enqueuedAt: "2026-06-16T18:30:00.000Z",
        jobId: "job_1",
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        sequence: 1,
        status: "failed",
        tenantId: "tenant_1",
        updatedAt: "2026-06-16T18:30:00.000Z"
      })
    ).toThrow("Failed API jobs require a safe error message.");

    expect(() =>
      ApiJobStatusRecordSchema.parse({
        enqueuedAt: "2026-06-16T18:30:00.000Z",
        jobId: "job_1",
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "reported",
          serviceId: "service_1"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        sequence: 1,
        status: "queued",
        tenantId: "tenant_1",
        updatedAt: "2026-06-16T18:30:00.000Z"
      })
    ).toThrow();

    expect(() =>
      ApiJobStatusRecordSchema.parse({
        enqueuedAt: "2026-06-16T18:30:00.000Z",
        jobId: "job_1",
        jobType: "ccli-reporting",
        payload: {
          reportingStatus: "pending",
          serviceId: "service_1"
        },
        requestedByActorId: "actor_1",
        requestId: "request_ccli_reporting",
        safeErrorMessage: "Only failed jobs can expose this.",
        sequence: 1,
        status: "queued",
        tenantId: "tenant_1",
        updatedAt: "2026-06-16T18:30:00.000Z"
      })
    ).toThrow("Only failed API jobs can include a safe error message.");

    await expect(
      jobDispatcher.getJobStatus({
        jobId: "",
        requestedByActorId: "actor_1",
        requestId: "request_status",
        tenantId: "tenant_1"
      })
    ).rejects.toThrow();
  });
});
