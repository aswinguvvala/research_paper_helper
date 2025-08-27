# AWS EC2 Free Tier Deployment Guide

Complete guide to deploy the Research Paper Helper application on AWS EC2 Free Tier using Docker.

## Prerequisites

- AWS Account with Free Tier eligibility
- Basic understanding of AWS EC2 and Docker
- SSH client (Terminal on Mac/Linux, PuTTY on Windows)

## Step 1: Launch EC2 Instance

### 1.1 Create EC2 Instance
1. Log into AWS Console → EC2 Dashboard
2. Click "Launch Instance"
3. **Name**: `research-paper-helper`
4. **AMI**: Ubuntu Server 22.04 LTS (Free Tier Eligible)
5. **Instance Type**: `t2.micro` (Free Tier Eligible)
6. **Key Pair**: Create new or use existing
7. **Security Group**: Configure as shown below

### 1.2 Security Group Configuration
Create a security group with these inbound rules:

| Type | Protocol | Port Range | Source | Description |
|------|----------|------------|--------|-------------|
| SSH | TCP | 22 | Your IP | SSH access |
| HTTP | TCP | 80 | 0.0.0.0/0 | Web application |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Secure web access |
| Custom TCP | TCP | 8000 | 0.0.0.0/0 | API access (optional) |

### 1.3 Storage Configuration
- **Root Volume**: 8 GB gp2 (Free Tier limit: 30GB total)
- Keep default settings for Free Tier eligibility

## Step 2: Connect to EC2 Instance

### 2.1 SSH Connection
```bash
# Replace with your key file and instance public IP
chmod 400 your-key-pair.pem
ssh -i "your-key-pair.pem" ubuntu@your-ec2-public-ip
```

### 2.2 Verify Connection
```bash
# Check system info
cat /etc/os-release
free -h
df -h
```

## Step 3: Automated Deployment

### 3.1 Download and Run Deployment Script
```bash
# Download deployment script
wget https://raw.githubusercontent.com/aswinguvvala/research_paper_helper/main/deployment/aws/deploy.sh

# Make executable and run
chmod +x deploy.sh
sudo ./deploy.sh
```

The script will automatically:
- Update system packages
- Install Docker and Docker Compose
- Clone the application repository
- Configure environment variables
- Set up firewall rules
- Build and start all services
- Configure monitoring and auto-start
- Perform health checks

### 3.2 Manual Deployment (Alternative)
If you prefer manual deployment:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Clone repository
git clone https://github.com/aswinguvvala/research_paper_helper.git
cd research_paper_helper

# Deploy with Docker Compose
docker-compose -f docker-compose.prod.yml up -d --build
```

## Step 4: Verify Deployment

### 4.1 Check Services Status
```bash
# Check all containers
docker ps

# Check application logs
docker-compose -f docker-compose.prod.yml logs -f

# Check specific service logs
docker-compose -f docker-compose.prod.yml logs frontend
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs ai-service
```

### 4.2 Test Application
Visit your application:
- **Frontend**: `http://your-ec2-public-ip`
- **API**: `http://your-ec2-public-ip/api`
- **Health Check**: `http://your-ec2-public-ip/health`

### 4.3 Test Upload Feature
1. Go to the frontend URL
2. Select education level
3. Upload a sample PDF
4. Test the chat functionality

## Step 5: Production Optimizations

### 5.1 Enable HTTPS (Optional)
```bash
# Install Certbot
sudo apt install certbot

# Get SSL certificate (replace with your domain)
sudo certbot certonly --standalone -d your-domain.com

# Update nginx configuration to enable HTTPS
# Edit nginx/conf.d/default.conf and uncomment HTTPS section
```

### 5.2 Configure Domain Name
1. Register a domain or use Route 53
2. Point domain to your EC2 public IP
3. Update environment variables with your domain

### 5.3 Monitoring and Maintenance
```bash
# Monitor application
monitor-research-paper-helper

# Update application
cd /opt/research-paper-helper
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart services
sudo systemctl restart research-paper-helper
```

## Step 6: Cost Optimization

### 6.1 Free Tier Limits
- **EC2**: 750 hours/month of t2.micro
- **EBS**: 30 GB of storage
- **Data Transfer**: 1 GB outbound per month

### 6.2 Cost-Saving Tips
1. **Stop instance when not needed**: Use AWS console to stop (not terminate)
2. **Monitor usage**: Set up billing alerts
3. **Clean up resources**: Remove unused snapshots, volumes
4. **Use spot instances**: For non-production testing

### 6.3 Resource Monitoring
```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Check Docker resource usage
docker stats

# Clean up Docker resources
docker system prune -f
```

## Troubleshooting

### Common Issues

#### 1. Connection Refused
```bash
# Check if services are running
docker ps

# Check firewall
sudo ufw status

# Check security group settings in AWS Console
```

#### 2. Out of Memory
```bash
# Check memory usage
free -h

# Add swap space
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 3. Docker Build Fails
```bash
# Clean up Docker
docker system prune -a -f

# Check available disk space
df -h

# Rebuild with more verbose output
docker-compose -f docker-compose.prod.yml build --no-cache --progress=plain
```

#### 4. Port Already in Use
```bash
# Find process using port
sudo netstat -tulpn | grep :80

# Kill process if needed
sudo kill -9 <PID>
```

### Log Locations
- **Application Logs**: `docker-compose logs`
- **System Logs**: `/var/log/`
- **Nginx Logs**: `docker-compose logs nginx`

## Security Best Practices

1. **Keep system updated**: Regular `apt update && apt upgrade`
2. **Use SSH keys**: Disable password authentication
3. **Configure firewall**: Only allow necessary ports
4. **Regular backups**: Backup application data
5. **Monitor access**: Check `/var/log/auth.log` regularly

## Backup and Restore

### Backup
```bash
# Backup uploaded files
tar -czf backup-$(date +%Y%m%d).tar.gz /opt/research-paper-helper/server/uploads/

# Backup configuration
cp -r /opt/research-paper-helper/.env.production ~/backup/
```

### Restore
```bash
# Restore from backup
cd /opt/research-paper-helper
tar -xzf backup-YYYYMMDD.tar.gz
docker-compose -f docker-compose.prod.yml restart
```

## Maintenance Schedule

### Daily
- Check application accessibility
- Monitor disk space usage

### Weekly
- Review application logs
- Update system packages
- Clean up Docker resources

### Monthly
- Review AWS billing
- Update application to latest version
- Review security settings

## Support

For issues and support:
1. Check application logs first
2. Review this documentation
3. Check GitHub issues: https://github.com/aswinguvvala/research_paper_helper/issues

---

**Total Deployment Time**: ~15-20 minutes
**Monthly Cost**: $0 (within Free Tier limits)
**Performance**: Suitable for development and light production use