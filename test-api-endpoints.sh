#!/bin/bash

# API Endpoint Testing Script
# Tests all endpoints documented in API_DOCUMENTATION.md

API_BASE="http://localhost:3000"
JWT_TOKEN="${JWT_TOKEN:-}"  # Set JWT_TOKEN env var if available
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="api-test-report-${TIMESTAMP}.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "PASS")
            echo -e "${GREEN}✓ PASS${NC} - $message"
            ((PASSED_TESTS++))
            ;;
        "FAIL")
            echo -e "${RED}✗ FAIL${NC} - $message"
            ((FAILED_TESTS++))
            ;;
        "SKIP")
            echo -e "${YELLOW}⊘ SKIP${NC} - $message"
            ((SKIPPED_TESTS++))
            ;;
        "INFO")
            echo -e "${BLUE}ℹ INFO${NC} - $message"
            ;;
    esac
}

# Function to test an endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local requires_auth=$4
    local data=$5

    ((TOTAL_TESTS++))

    echo ""
    echo "========================================="
    echo "TEST: $description"
    echo "ENDPOINT: $method $endpoint"
    echo "========================================="

    # Skip if auth required but no token provided
    if [ "$requires_auth" = "true" ] && [ -z "$JWT_TOKEN" ]; then
        print_status "SKIP" "Requires authentication (set JWT_TOKEN env var)"
        return
    fi

    # Build curl command
    local curl_cmd="curl -s -w '\nHTTP_CODE:%{http_code}' -X $method"

    if [ "$requires_auth" = "true" ]; then
        curl_cmd="$curl_cmd -H 'Authorization: Bearer $JWT_TOKEN'"
    fi

    curl_cmd="$curl_cmd -H 'Content-Type: application/json'"

    if [ -n "$data" ]; then
        curl_cmd="$curl_cmd -d '$data'"
    fi

    curl_cmd="$curl_cmd '$API_BASE$endpoint'"

    # Execute request
    response=$(eval $curl_cmd)
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d':' -f2)
    body=$(echo "$response" | sed '/HTTP_CODE:/d')

    echo "Response Code: $http_code"
    echo "Response Body:"
    echo "$body" | jq . 2>/dev/null || echo "$body"

    # Check if successful (2xx or 3xx)
    if [[ $http_code =~ ^[23] ]]; then
        print_status "PASS" "HTTP $http_code"
    else
        print_status "FAIL" "HTTP $http_code (Expected 2xx or 3xx)"
    fi
}

# Start testing
echo "========================================"
echo "API ENDPOINT TESTING SUITE"
echo "========================================"
echo "Base URL: $API_BASE"
echo "JWT Token: ${JWT_TOKEN:+[SET]}${JWT_TOKEN:-[NOT SET - Protected endpoints will be skipped]}"
echo "Report File: $REPORT_FILE"
echo "Started: $(date)"
echo ""

# Redirect output to both console and file
exec > >(tee -a "$REPORT_FILE") 2>&1

echo "========================================"
echo "1. PUBLIC ENDPOINTS"
echo "========================================"

# Health Check
test_endpoint "GET" "/health" "Health Check" "false"

echo ""
echo "========================================"
echo "2. SKU ENDPOINTS (Require Auth)"
echo "========================================"

# List SKUs
test_endpoint "GET" "/api/skus?limit=5" "List SKUs (5 results)" "true"

# Search SKUs
test_endpoint "GET" "/api/skus?search=Jordan&limit=3" "Search SKUs (Jordan)" "true"

# Filter by brand
test_endpoint "GET" "/api/skus?brand=Nike&limit=3" "Filter SKUs by Brand (Nike)" "true"

# Filter by tier
test_endpoint "GET" "/api/skus?tier=1&limit=3" "Filter SKUs by Tier (1)" "true"

# Get SKU catalog
test_endpoint "GET" "/api/skus/catalog?limit=10" "Get SKU Catalog" "true"

# Search catalog
test_endpoint "GET" "/api/skus/catalog?search=dunk&limit=5" "Search Catalog (dunk)" "true"

# Get trending/popular
test_endpoint "GET" "/api/skus/trending/popular?limit=5" "Get Trending/Popular SKUs" "true"

# Get single SKU (ID 1)
test_endpoint "GET" "/api/skus/1" "Get SKU by ID (1)" "true"

echo ""
echo "========================================"
echo "3. PRICE ENDPOINTS (Require Auth)"
echo "========================================"

# Get current price (assuming style code exists)
if [ -n "$JWT_TOKEN" ]; then
    # Get a style code from the catalog first
    style_code=$(curl -s -H "Authorization: Bearer $JWT_TOKEN" "$API_BASE/api/skus?limit=1" | jq -r '.skus[0].style_code' 2>/dev/null)

    if [ -n "$style_code" ] && [ "$style_code" != "null" ]; then
        echo "Using style_code: $style_code for price tests"

        test_endpoint "GET" "/api/prices/$style_code" "Get Current Price" "true"

        test_endpoint "GET" "/api/prices/$style_code/history?days=30" "Get 30-Day Price History" "true"

        test_endpoint "GET" "/api/prices/$style_code/history?days=60&limit=50" "Get 60-Day Price History" "true"

        test_endpoint "GET" "/api/prices/$style_code/history?days=90" "Get 90-Day Price History" "true"
    else
        print_status "SKIP" "No style_code found to test price endpoints"
    fi
else
    print_status "SKIP" "Price endpoints require authentication"
fi

echo ""
echo "========================================"
echo "4. ANALYTICS ENDPOINTS (Require Auth)"
echo "========================================"

test_endpoint "GET" "/api/analytics" "Get Analytics Overview" "true"

echo ""
echo "========================================"
echo "5. ADMIN ENDPOINTS (Require Auth + Admin)"
echo "========================================"

test_endpoint "GET" "/api/admin/dashboard" "Get Admin Dashboard" "true"

test_endpoint "GET" "/api/admin/skus?limit=5" "Get Admin SKUs List" "true"

test_endpoint "GET" "/api/admin/recent-skus?limit=5" "Get Recent SKUs (Admin)" "true"

test_endpoint "GET" "/api/admin/recent-prices?limit=5" "Get Recent Prices (Admin)" "true"

echo ""
echo "========================================"
echo "TEST SUMMARY"
echo "========================================"
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo -e "${YELLOW}Skipped: $SKIPPED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ] && [ $PASSED_TESTS -gt 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    exit_code=0
elif [ $SKIPPED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${YELLOW}⊘ ALL TESTS SKIPPED (No JWT token provided)${NC}"
    echo "To run protected endpoint tests, set JWT_TOKEN environment variable:"
    echo "  export JWT_TOKEN='your-jwt-token'"
    echo "  ./test-api-endpoints.sh"
    exit_code=0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    exit_code=1
fi

echo ""
echo "Full report saved to: $REPORT_FILE"
echo "Completed: $(date)"

exit $exit_code
