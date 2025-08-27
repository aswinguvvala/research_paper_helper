# AWS Deployment Scripts

Complete deployment solution for Research Paper Helper on AWS EC2 Free Tier.

## 🚀 Quick Start

### One-Command Deployment
```bash
# SSH to your EC2 instance, then:
curl -sSL https://raw.githubusercontent.com/aswinguvvala/research_paper_helper/main/deployment/aws/deploy.sh | sudo bash
```

### Manual Deployment
```bash
# Clone repository
git clone https://github.com/aswinguvvala/research_paper_helper.git
cd research_paper_helper

# Run deployment script
sudo ./deployment/aws/deploy.sh
```

## 📁 Files Overview

| File | Purpose | Usage |
|------|---------|-------|
| `deploy.sh` | Main deployment script | `sudo ./deploy.sh` |
| `update.sh` | Update running application | `sudo ./update.sh` |
| `monitor.sh` | System monitoring | `./monitor.sh [--watch|--logs]` |
| `AWS_DEPLOYMENT_GUIDE.md` | Complete deployment guide | Documentation |
| `COST_OPTIMIZATION.md` | Free tier optimization | Cost management |

## 🛠️ Scripts Description

### 1. deploy.sh
**Purpose**: Full deployment automation
**Features**:
- System updates and Docker installation
- Application setup and configuration
- Security configuration (firewall, etc.)
- Service auto-start setup
- Health checks and monitoring

### 2. update.sh
**Purpose**: Update running application
**Features**:
- Graceful service shutdown
- Git pull latest changes
- Rebuild and restart containers
- Health verification
- Automatic rollback on failure

### 3. monitor.sh
**Purpose**: System and application monitoring
**Features**:
- Real-time resource monitoring
- Service health checks
- Docker container status
- Recent error logs
- System warnings and alerts

## 🔧 Usage Examples

### Deploy Application
```bash
# First time deployment
sudo ./deployment/aws/deploy.sh

# Check deployment status
./deployment/aws/monitor.sh
```

### Update Application
```bash
# Update to latest version
sudo ./deployment/aws/update.sh

# Monitor after update
./deployment/aws/monitor.sh --watch
```

### Monitor System
```bash
# One-time check
./deployment/aws/monitor.sh

# Continuous monitoring
./deployment/aws/monitor.sh --watch

# View logs only
./deployment/aws/monitor.sh --logs
```

### Docker Management
```bash
# View all containers
docker ps

# View application logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend

# Full restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## 🏗️ Infrastructure Components

### Services Deployed
1. **Frontend**: React application (port 80)
2. **Backend**: Node.js API server (port 8000)  
3. **AI Service**: Python FastAPI (port 5000)
4. **Nginx**: Reverse proxy and load balancer
5. **Monitoring**: System monitoring and health checks

### Network Configuration
```
Internet → Nginx (80/443) → Frontend (3000)
                          → Backend API (8000) → AI Service (5000)
```

### Security Features
- UFW firewall configuration
- Nginx rate limiting
- Security headers
- SSL/HTTPS support (when configured)
- Automated security updates

## 📊 Monitoring and Maintenance

### Health Checks
```bash
# Quick health check
curl http://your-ec2-ip/health

# Application accessibility
curl http://your-ec2-ip

# API functionality
curl http://your-ec2-ip/api/health
```

### Log Management
```bash
# Application logs
docker-compose logs -f

# System logs
sudo journalctl -f

# Nginx logs
docker-compose logs nginx

# Error analysis
./deployment/aws/monitor.sh --logs | grep -i error
```

### Resource Management
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Clean up Docker resources
docker system prune -f

# Monitor resource usage
watch 'free -h && df -h && docker stats --no-stream'
```

## 🚨 Troubleshooting

### Common Issues

#### Services Won't Start
```bash
# Check Docker status
sudo systemctl status docker

# View error logs
docker-compose logs

# Restart all services
sudo ./deployment/aws/update.sh
```

#### Out of Disk Space
```bash
# Clean Docker resources
docker system prune -a -f

# Remove old log files
sudo find /var/log -type f -name "*.log" -mtime +7 -delete

# Check largest files
sudo du -ah / | sort -rh | head -20
```

#### High Memory Usage
```bash
# Check memory usage
free -h

# Restart services to free memory
docker-compose restart

# Add swap space if needed
sudo fallocate -l 1G /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### Network Issues
```bash
# Check firewall
sudo ufw status

# Test connectivity
curl -I http://localhost

# Check port availability
sudo netstat -tulpn | grep :80
```

### Recovery Procedures

#### Complete Reset
```bash
# Stop all services
docker-compose down

# Remove all containers and images
docker system prune -a --volumes -f

# Redeploy
sudo ./deployment/aws/deploy.sh
```

#### Rollback Update
```bash
# If update fails, restore from backup
cd /opt/research-paper-helper
git reset --hard HEAD~1
docker-compose up -d --build
```

## 💰 Cost Management

### Free Tier Monitoring
- **Instance Hours**: 750/month (t2.micro)
- **Storage**: 30 GB total
- **Data Transfer**: 1 GB outbound/month
- **Monitoring**: Basic CloudWatch included

### Cost Optimization Tips
1. Stop instance when not needed
2. Regular cleanup of Docker resources
3. Monitor disk and memory usage
4. Use efficient container images
5. Set up billing alerts

See `COST_OPTIMIZATION.md` for detailed cost management strategies.

## 🔒 Security Best Practices

### Implemented Security
- UFW firewall with minimal open ports
- Nginx security headers
- Rate limiting for API endpoints
- Regular security updates
- Non-root container execution

### Additional Security (Recommended)
- SSL/TLS certificates (Let's Encrypt)
- Fail2ban for intrusion prevention
- Regular security audits
- SSH key-only authentication
- VPN for administrative access

## 📈 Scaling and Performance

### Performance Optimization
- Nginx caching and compression
- Docker multi-stage builds
- Resource limits for containers
- Log rotation and cleanup
- Database connection pooling (if applicable)

### Horizontal Scaling Options
- AWS Application Load Balancer
- Multiple EC2 instances
- Auto Scaling Groups
- Container orchestration (EKS)

---

**Support**: For issues, check the troubleshooting section or create a GitHub issue.
**Documentation**: See `AWS_DEPLOYMENT_GUIDE.md` for complete deployment instructions.
**Cost Management**: See `COST_OPTIMIZATION.md` for keeping within free tier limits.