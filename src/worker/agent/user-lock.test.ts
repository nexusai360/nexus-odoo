import { acquireUserLock, releaseUserLock } from "./user-lock";
import { redis } from "@/lib/redis";

jest.mock("@/lib/redis", () => ({ redis: { set: jest.fn(), del: jest.fn() } }));

describe("user-lock", () => {
  const set = redis.set as jest.Mock;
  const del = redis.del as jest.Mock;
  beforeEach(() => {
    set.mockReset();
    del.mockReset();
  });

  it("adquire o lock quando SET NX retorna OK", async () => {
    set.mockResolvedValue("OK");
    expect(await acquireUserLock("u1")).toBe(true);
    const args = set.mock.calls[0];
    expect(args[0]).toBe("agent:lock:wa:u1");
    expect(args).toContain("PX");
    expect(args).toContain("NX");
  });

  it("não adquire quando SET NX retorna null", async () => {
    set.mockResolvedValue(null);
    expect(await acquireUserLock("u1")).toBe(false);
  });

  it("libera o lock", async () => {
    await releaseUserLock("u1");
    expect(del).toHaveBeenCalledWith("agent:lock:wa:u1");
  });
});
