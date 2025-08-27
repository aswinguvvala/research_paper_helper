FROM nginx:alpine

# Copy custom nginx configuration
COPY conf.d/default.conf /etc/nginx/conf.d/default.conf

# Copy SSL certificates (if available)
# COPY ssl/ /etc/nginx/ssl/

# Create necessary directories
RUN mkdir -p /var/log/nginx && \
    mkdir -p /etc/nginx/ssl

# Expose ports
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]