import { describe, expect, it } from "vitest";
import {
  ApiJobRequestSchema,
  createInMemoryJobDispatcher,
  validateApiJobRequest
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
  });
});
