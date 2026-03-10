import asyncio
import logging
import os

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from queue_consumer import QueueConsumer


async def main():
    consumer = QueueConsumer()
    await consumer.run()


if __name__ == "__main__":
    asyncio.run(main())
