# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
COPY go.mod ./

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /wistmail-engine ./cmd/wistmail-engine

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates

COPY --from=builder /wistmail-engine /usr/local/bin/wistmail-engine

EXPOSE 25 587 465 143 993 50051

ENTRYPOINT ["wistmail-engine"]
