import { createRedisConnection } from './redis.js';

const redis = createRedisConnection();

// Atomically reserves a send time per sender across every worker using this Redis.
// Reservations count against the rolling hour even when they are in the future.
const RESERVE_SLOT_SCRIPT = `
local key = KEYS[1]
local jobId = ARGV[1]
local now = tonumber(ARGV[2])
local minInterval = tonumber(ARGV[3])
local hourlyLimit = tonumber(ARGV[4])
local window = 3600000

local existing = redis.call('ZSCORE', key, jobId)
if existing then
  existing = tonumber(existing)
  if existing > now - window then
    return { existing, 0 }
  end
  redis.call('ZREM', key, jobId)
end

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local latest = redis.call('ZREVRANGE', key, 0, 0, 'WITHSCORES')
local candidate = now
if latest[2] then
  candidate = math.max(candidate, tonumber(latest[2]) + minInterval)
end

local limitedByHourlyCap = 0
for _ = 1, 10000 do
  local count = redis.call('ZCOUNT', key, candidate - window + 1, candidate)
  if count < hourlyLimit then
    break
  end

  local first = redis.call('ZRANGEBYSCORE', key, candidate - window + 1, candidate, 'WITHSCORES', 'LIMIT', 0, 1)
  if not first[2] then
    break
  end

  limitedByHourlyCap = 1
  candidate = math.max(candidate, tonumber(first[2]) + window)
end

redis.call('ZADD', key, candidate, jobId)
redis.call('PEXPIRE', key, 7200000)
return { candidate, limitedByHourlyCap }
`;

export type ReservedSendSlot = {
  sendAt: number;
  hourlyLimitHit: boolean;
};

export async function reserveSendSlot(
  senderId: string,
  jobId: string,
  minIntervalMs: number,
  maxEmailsPerHour: number,
): Promise<ReservedSendSlot> {
  const senderKey = Buffer.from(senderId).toString('hex');
  const result = await redis.eval(
    RESERVE_SLOT_SCRIPT,
    1,
    `email-rate:${senderKey}`,
    jobId,
    Date.now(),
    minIntervalMs,
    maxEmailsPerHour,
  ) as Array<number | string>;

  return {
    sendAt: Number(result[0]),
    hourlyLimitHit: Number(result[1]) === 1,
  };
}

export async function closeRateLimiter(): Promise<void> {
  await redis.quit();
}
