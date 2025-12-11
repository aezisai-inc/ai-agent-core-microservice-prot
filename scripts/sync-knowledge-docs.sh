#!/bin/bash
#
# S3 ↔ ローカル ナレッジドキュメント同期スクリプト
#
# Usage:
#   ./scripts/sync-knowledge-docs.sh download  # S3 → ローカル
#   ./scripts/sync-knowledge-docs.sh upload    # ローカル → S3
#   ./scripts/sync-knowledge-docs.sh both      # 双方向同期
#   ./scripts/sync-knowledge-docs.sh watch     # 変更監視 (fswatch必要)
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_DOCS_DIR="$PROJECT_ROOT/docs/knowledge"
S3_BUCKET="agentcore-documents-226484346947-development"
S3_PREFIX="documents/generated/"
AWS_REGION="ap-northeast-1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Ensure local directory exists
ensure_local_dir() {
    if [ ! -d "$LOCAL_DOCS_DIR" ]; then
        log_info "Creating local directory: $LOCAL_DOCS_DIR"
        mkdir -p "$LOCAL_DOCS_DIR"
    fi
}

# Download from S3 to local
download_from_s3() {
    ensure_local_dir
    log_info "Syncing S3 → Local"
    log_info "  Source: s3://$S3_BUCKET/$S3_PREFIX"
    log_info "  Dest:   $LOCAL_DOCS_DIR/"
    
    aws s3 sync \
        "s3://$S3_BUCKET/$S3_PREFIX" \
        "$LOCAL_DOCS_DIR/" \
        --region "$AWS_REGION" \
        --delete \
        --exclude ".*"
    
    log_success "Download complete!"
    
    # Show downloaded files
    echo ""
    log_info "Local files:"
    find "$LOCAL_DOCS_DIR" -type f -name "*.md" | head -20
}

# Upload from local to S3
upload_to_s3() {
    ensure_local_dir
    log_info "Syncing Local → S3"
    log_info "  Source: $LOCAL_DOCS_DIR/"
    log_info "  Dest:   s3://$S3_BUCKET/$S3_PREFIX"
    
    aws s3 sync \
        "$LOCAL_DOCS_DIR/" \
        "s3://$S3_BUCKET/$S3_PREFIX" \
        --region "$AWS_REGION" \
        --exclude ".*" \
        --exclude ".DS_Store" \
        --content-type "text/markdown; charset=utf-8"
    
    log_success "Upload complete!"
}

# Bidirectional sync (download first, then upload new local files)
sync_both() {
    log_info "Bidirectional sync starting..."
    
    # First download to get latest from S3
    download_from_s3
    
    echo ""
    log_info "Now uploading local changes..."
    
    # Then upload (without --delete to preserve S3 files)
    aws s3 sync \
        "$LOCAL_DOCS_DIR/" \
        "s3://$S3_BUCKET/$S3_PREFIX" \
        --region "$AWS_REGION" \
        --exclude ".*" \
        --exclude ".DS_Store" \
        --content-type "text/markdown; charset=utf-8"
    
    log_success "Bidirectional sync complete!"
}

# Watch for changes and auto-sync (requires fswatch)
watch_and_sync() {
    if ! command -v fswatch &> /dev/null; then
        log_error "fswatch is required for watch mode"
        log_info "Install with: brew install fswatch"
        exit 1
    fi
    
    ensure_local_dir
    log_info "Watching for changes in $LOCAL_DOCS_DIR"
    log_info "Press Ctrl+C to stop"
    
    fswatch -o "$LOCAL_DOCS_DIR" | while read -r; do
        log_info "Change detected, syncing..."
        upload_to_s3
    done
}

# Show current status
show_status() {
    echo ""
    echo "=== Knowledge Documents Sync Status ==="
    echo ""
    log_info "Local directory: $LOCAL_DOCS_DIR"
    log_info "S3 bucket: s3://$S3_BUCKET/$S3_PREFIX"
    echo ""
    
    log_info "Local files:"
    if [ -d "$LOCAL_DOCS_DIR" ]; then
        find "$LOCAL_DOCS_DIR" -type f -name "*.md" 2>/dev/null | wc -l | xargs echo "  Count:"
        find "$LOCAL_DOCS_DIR" -type f -name "*.md" 2>/dev/null | head -10
    else
        echo "  (directory not created)"
    fi
    
    echo ""
    log_info "S3 files:"
    aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX" --recursive --region "$AWS_REGION" 2>/dev/null | wc -l | xargs echo "  Count:"
    aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX" --recursive --region "$AWS_REGION" 2>/dev/null | head -10
}

# Trigger Knowledge Base ingestion after sync
trigger_ingestion() {
    KNOWLEDGE_BASE_ID="${KNOWLEDGE_BASE_ID:-KCOEXQD1NV}"
    DATA_SOURCE_ID="${DATA_SOURCE_ID:-R1BW5OB1WP}"
    
    log_info "Triggering Knowledge Base ingestion..."
    log_info "  KB ID: $KNOWLEDGE_BASE_ID"
    log_info "  DS ID: $DATA_SOURCE_ID"
    
    JOB_ID=$(aws bedrock-agent start-ingestion-job \
        --knowledge-base-id "$KNOWLEDGE_BASE_ID" \
        --data-source-id "$DATA_SOURCE_ID" \
        --region "$AWS_REGION" \
        --query 'ingestionJob.ingestionJobId' \
        --output text)
    
    log_success "Ingestion job started: $JOB_ID"
}

# Main
case "${1:-status}" in
    download|pull)
        download_from_s3
        ;;
    upload|push)
        upload_to_s3
        ;;
    both|sync)
        sync_both
        ;;
    watch)
        watch_and_sync
        ;;
    ingest)
        trigger_ingestion
        ;;
    upload-ingest)
        upload_to_s3
        echo ""
        trigger_ingestion
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {download|upload|both|watch|ingest|upload-ingest|status}"
        echo ""
        echo "Commands:"
        echo "  download      Download S3 → Local"
        echo "  upload        Upload Local → S3"
        echo "  both          Bidirectional sync"
        echo "  watch         Watch local changes and auto-upload"
        echo "  ingest        Trigger KB ingestion"
        echo "  upload-ingest Upload then trigger ingestion"
        echo "  status        Show current sync status"
        exit 1
        ;;
esac
