# AWS Free Tier Cost Optimization Guide

Guide to keep your Research Paper Helper deployment within AWS Free Tier limits.

## Free Tier Limits (12 months)

### EC2 Free Tier
- **Hours**: 750 hours per month of t2.micro instances
- **Storage**: 30 GB of EBS General Purpose (gp2) storage
- **Data Transfer**: 1 GB of outbound data transfer per month
- **Elastic IP**: 1 free Elastic IP (when attached to running instance)

### Additional Services
- **Route 53**: 1 hosted zone, 1 million DNS queries
- **Certificate Manager**: Free SSL certificates
- **CloudWatch**: Basic monitoring, 10 custom metrics

## Cost Monitoring Setup

### 1. Set Up Billing Alerts
```bash
# Enable billing alerts in AWS Console:
# 1. Go to Billing & Cost Management
# 2. Preferences → Receive Billing Alerts → Enable
# 3. CloudWatch → Alarms → Create Alarm
# 4. Set threshold: $1, $5, $10 alerts
```

### 2. Cost Tracking Script
Create a simple cost tracking script:

```bash
#!/bin/bash
# Save as: check-costs.sh

echo "=== AWS Cost Tracking ==="
echo "Instance uptime this month: $(aws ec2 describe-instances --query 'Reservations[].Instances[?State.Name==`running`].LaunchTime' --output text | wc -l) hours"
echo "Current EBS usage: $(df -h / | tail -1 | awk '{print $3}')"
echo ""
echo "💡 Free tier allows:"
echo "   - 750 hours/month (24/7 for 31 days = 744 hours)"
echo "   - 30 GB EBS storage"
echo "   - 1 GB outbound transfer"
```

## Optimization Strategies

### 1. Instance Management

#### Auto-Stop Script
```bash
#!/bin/bash
# Save as: auto-stop.sh
# Stop instance at night (customize timezone)

current_hour=$(date +%H)
if [ $current_hour -ge 23 ] || [ $current_hour -le 6 ]; then
    echo "Stopping instance for the night..."
    sudo shutdown -h now
fi
```

#### Start/Stop Schedule
```bash
# Add to crontab: crontab -e
# Stop at 11 PM
0 23 * * * /home/ubuntu/auto-stop.sh

# Manual start needed or use Lambda function
```

### 2. Storage Optimization

#### Clean Up Docker Resources
```bash
#!/bin/bash
# Save as: cleanup-docker.sh

echo "Docker cleanup starting..."

# Remove stopped containers
docker container prune -f

# Remove unused images
docker image prune -a -f

# Remove unused volumes
docker volume prune -f

# Remove build cache
docker builder prune -a -f

echo "Docker cleanup completed"
df -h
```

#### Log Rotation
```bash
# Configure log rotation in /etc/logrotate.d/docker-containers
/var/lib/docker/containers/*/*.log {
    daily
    rotate 3
    compress
    size 10M
    copytruncate
    missingok
    notifempty
}
```

### 3. Application Optimization

#### Reduce Image Sizes
Update Dockerfiles for smaller images:

```dockerfile
# Use Alpine Linux instead of Ubuntu
FROM node:18-alpine AS build

# Multi-stage builds
FROM node:18-alpine AS dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine AS runtime
COPY --from=dependencies /app/node_modules ./node_modules
```

#### Resource Limits
Update docker-compose.prod.yml:

```yaml
services:
  frontend:
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
  
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

## Monitoring and Alerts

### 1. Resource Monitoring Script
```bash
#!/bin/bash
# Save as: resource-monitor.sh

# Check disk usage
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "WARNING: Disk usage is ${DISK_USAGE}%"
    echo "Running cleanup..."
    ./cleanup-docker.sh
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100)}')
if [ $MEMORY_USAGE -gt 85 ]; then
    echo "WARNING: Memory usage is ${MEMORY_USAGE}%"
    docker-compose restart
fi

# Check uptime (warn if approaching 750 hours)
UPTIME_HOURS=$(uptime -s | xargs -I {} date -d {} +%s | xargs -I {} echo $(( ($(date +%s) - {}) / 3600 )))
MONTH_START=$(date +%s -d "$(date +%Y-%m-01)")
CURRENT_TIME=$(date +%s)
MONTH_HOURS=$(( (CURRENT_TIME - MONTH_START) / 3600 ))

if [ $MONTH_HOURS -gt 700 ]; then
    echo "WARNING: Approaching monthly hour limit: ${MONTH_HOURS}/750 hours"
fi
```

### 2. Automated Cleanup Cron Jobs
```bash
# Add to crontab: crontab -e

# Daily Docker cleanup at 2 AM
0 2 * * * /home/ubuntu/cleanup-docker.sh

# Weekly resource check
0 6 * * 1 /home/ubuntu/resource-monitor.sh

# Monthly cost report
0 9 1 * * /home/ubuntu/cost-report.sh
```

## Emergency Cost Controls

### 1. Quick Stop Script
```bash
#!/bin/bash
# Save as: emergency-stop.sh

echo "🚨 Emergency shutdown initiated..."

# Stop all services
cd /opt/research-paper-helper
sudo docker-compose -f docker-compose.prod.yml down

# Stop Docker service
sudo systemctl stop docker

# Stop instance (from within instance)
sudo shutdown -h now

echo "Instance will shutdown in 1 minute"
```

### 2. Cost Breach Response
```bash
#!/bin/bash
# Save as: cost-breach.sh
# Run when costs exceed expected limits

echo "💸 Cost breach detected - implementing emergency measures"

# 1. Scale down to minimal resources
cd /opt/research-paper-helper
sudo docker-compose -f docker-compose.prod.yml down

# 2. Clean up all Docker resources
sudo docker system prune -a --volumes -f

# 3. Remove unnecessary files
sudo apt autoremove -y
sudo apt autoclean

# 4. Archive logs and uploads
tar -czf /tmp/backup-$(date +%Y%m%d).tar.gz /opt/research-paper-helper/server/uploads
rm -rf /opt/research-paper-helper/server/uploads/*
rm -rf /opt/research-paper-helper/server/logs/*

echo "Emergency measures completed. Instance ready for minimal operation."
```

## Alternative Deployment Options

### 1. Heroku Free Tier (if available)
- 550 dyno hours/month free
- Automatic scaling to zero
- Built-in CI/CD

### 2. Railway/Render
- Free tier with limitations
- Automatic deployments
- Good for smaller applications

### 3. Oracle Cloud Always Free
- 2 AMD instances (1/8 OCPU, 1 GB RAM each)
- 4 ARM instances (1/4 OCPU, 24 GB RAM total)
- More generous than AWS Free Tier

## Best Practices Summary

### ✅ Do's
- Monitor usage daily
- Set up billing alerts
- Use smallest instance types
- Implement auto-cleanup
- Regular resource monitoring
- Archive old data
- Use efficient Docker images
- Implement proper caching

### ❌ Don'ts
- Run multiple instances
- Leave instance running 24/7 unnecessarily
- Store large files unnecessarily
- Use oversized instance types
- Ignore cleanup routines
- Skip monitoring setup
- Use inefficient images
- Exceed data transfer limits

### Monthly Checklist
- [ ] Check billing dashboard
- [ ] Review resource usage
- [ ] Clean up old backups
- [ ] Update application if needed
- [ ] Verify auto-cleanup is working
- [ ] Check security logs
- [ ] Review performance metrics

## Recovery Plan

If you exceed free tier limits:
1. **Stop all services immediately**
2. **Review AWS billing dashboard**
3. **Implement emergency cost controls**
4. **Consider alternative deployment options**
5. **Optimize application for lower resource usage**

Remember: AWS Free Tier is generous, but requires active monitoring to stay within limits!