import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    database: required('DB_NAME', 'highway_led_control'),
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  mqtt: {
    url: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
  },
  // Deliberately NOT derived from NODE_ENV: whether HTTPS should be enforced
  // depends on whether a TLS-terminating reverse proxy sits in front of this
  // app (SRS §13.2 item 21, hosting target TBD), not on whether it's running
  // in "production mode". A production deployment without that proxy in
  // front must leave this false or every request will 301-redirect-loop.
  enforceHttps: process.env.ENFORCE_HTTPS === 'true',
};
