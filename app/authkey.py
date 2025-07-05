import redis
redis_url = "redis://redis-mytextwriter:6379"
redis_client = redis.from_url(redis_url)
