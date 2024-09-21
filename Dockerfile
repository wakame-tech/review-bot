FROM denoland/deno:1.46.3

COPY . .
ENTRYPOINT ["deno", "task", "review"]
