#!/bin/bash

# IPv6 Diagnostic Script
# Helps identify why IPv6 access isn't working

echo "========================================="
echo "IPv6 Connectivity Diagnostic"
echo "========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Check if IPv6 is enabled on system
echo "1. IPv6 Support on This Machine"
echo "================================"
if [ -f /proc/net/if_inet6 ]; then
    echo -e "${GREEN}✓${NC} IPv6 is enabled on system"
    cat /proc/net/if_inet6 | awk '{print "   Interface: " $6}'
else
    echo -e "${RED}✗${NC} IPv6 not enabled - check kernel config"
fi
echo ""

# Test 2: Check IPv6 addresses
echo "2. IPv6 Addresses on This Machine"
echo "=================================="
ip -6 addr show | grep "inet6" | grep -v "fe80" | grep -v "::1" | while read addr; do
    echo "   $addr"
done
echo ""

# Test 3: Check if port 3000 is listening on IPv6
echo "3. Port 3000 Listening on IPv6"
echo "=============================="
ss -6tuln | grep ":3000" > /dev/null && echo -e "${GREEN}✓${NC} Listening on IPv6" || echo -e "${RED}✗${NC} Not listening on IPv6"
ss -4tuln | grep ":3000" > /dev/null && echo -e "${GREEN}✓${NC} Listening on IPv4" || echo -e "${RED}✗${NC} Not listening on IPv4"
echo ""

# Test 4: Test localhost IPv6
echo "4. Test Localhost IPv6"
echo "======================"
curl -6 -s http://[::1]:3000/health > /dev/null 2>&1 && echo -e "${GREEN}✓${NC} IPv6 localhost works" || echo -e "${RED}✗${NC} IPv6 localhost fails"
echo ""

# Test 5: Check IPv6 routes
echo "5. IPv6 Routes"
echo "=============="
ip -6 route show | head -5
echo ""

# Test 6: Test external IPv6 connectivity
echo "6. External IPv6 Connectivity"
echo "============================="
ping6 -c 1 -W 2 2001:4860:4860::8888 > /dev/null 2>&1 && echo -e "${GREEN}✓${NC} Can reach external IPv6 (Google DNS)" || echo -e "${RED}✗${NC} Cannot reach external IPv6"
echo ""

# Test 7: Your public IPv6
echo "7. Your Public IPv6 Address"
echo "============================"
echo "Your IPv6: 2a0e:1d47:8685:5500::3d"
echo "Access API at: http://[2a0e:1d47:8685:5500::3d]:3000/health"
echo ""

# Test 8: Firewall status
echo "8. Firewall Status"
echo "=================="
if command -v ufw &> /dev/null; then
    ufw status | head -5
else
    echo "UFW not installed, checking iptables..."
    iptables -L -n 2>/dev/null | grep -E "Chain|3000" || echo "No iptables rules found"
fi
echo ""

# Test 9: API process check
echo "9. API Process"
echo "=============="
pgrep -f "node.*dist/src/index" > /dev/null && echo -e "${GREEN}✓${NC} API process running" || echo -e "${RED}✗${NC} API process not running"
echo ""

# Test 10: Connectivity test summary
echo "10. Quick Connectivity Tests"
echo "============================"
echo "a) From this machine (localhost):"
curl -s http://localhost:3000/health | jq '.status' 2>/dev/null && echo "   ✓ Works" || echo "   ✗ Failed"

echo "b) From this machine (IPv4):"
curl -s http://127.0.0.1:3000/health | jq '.status' 2>/dev/null && echo "   ✓ Works" || echo "   ✗ Failed"

echo "c) From this machine (IPv6 localhost):"
curl -6 -s http://[::1]:3000/health | jq '.status' 2>/dev/null && echo "   ✓ Works" || echo "   ✗ Failed"

echo ""
echo "========================================="
echo "DIAGNOSIS SUMMARY"
echo "========================================="
echo ""
echo "If you can access localhost:3000 but not IPv6:"
echo "1. IPv6 might not be supported by your phone's carrier"
echo "2. Try different carriers (switch to WiFi from different ISP)"
echo "3. Check if your router supports IPv6"
echo "4. Contact ISP to enable IPv6"
echo ""
echo "For mobile testing:"
echo "- Must be on cellular data (NOT home WiFi)"
echo "- Must have IPv6 connectivity"
echo "- URL format is critical: http://[ADDRESS]:PORT"
echo ""
