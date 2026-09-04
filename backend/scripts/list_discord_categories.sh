#!/usr/bin/env bash
# Lista categorías Discord del guild ATV (solo lectura).
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import asyncio
import discord
from decouple import config
from src.services.discord_service import detectar_categoria

TOKEN = config("DISCORD_BOT_TOKEN", default="")
GUILD_ID = int(config("DISCORD_GUILD_ID", default="0"))

async def main():
    intents = discord.Intents.default()
    intents.guilds = True
    client = discord.Client(intents=intents)

    @client.event
    async def on_ready():
        try:
            g = client.get_guild(GUILD_ID)
            print(f"Guild: {g.name}")
            total = 0
            for cat in g.categories:
                slug = detectar_categoria(cat.name)
                n = len(cat.text_channels)
                total += n
                mark = slug or "—"
                print(f"[{mark:12}] {n:3} ch · {cat.name!r}")
            print(f"TOTAL text channels in categories: {total}")
            # channels not in matched categories that look private
            unmatched = []
            for cat in g.categories:
                if detectar_categoria(cat.name):
                    continue
                for ch in cat.text_channels:
                    unmatched.append((cat.name, ch.name))
            print(f"Unmatched category channels: {len(unmatched)}")
            for cat, ch in unmatched[:40]:
                print(f"  · {cat} / #{ch}")
        finally:
            await client.close()

    await client.start(TOKEN)

asyncio.run(main())
PY
