FROM node:24-bookworm-slim
WORKDIR /app

# .dockerignore is a strict allowlist; local secrets and data never enter the image.
COPY . .
RUN npm ci --omit=dev && node scripts/check-ffmpeg.js && npm run build:client && npm cache clean --force

ENV NODE_ENV=production \
    PORT=8080 \
    CLIENT_DELIVERY=standard \
    SUPABASE_REQUIRED=true \
    DATA_DIR=/tmp/crmzona-data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/health/live',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "lib/app.js"]
