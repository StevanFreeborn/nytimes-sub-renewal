import 'dotenv/config';
import zod from 'zod';

const envSchema = zod.object({
  LIB_USERNAME: zod.string().min(1),
  LIB_PASSWORD: zod.string().min(1),
  NY_USERNAME: zod.string().min(1),
  NY_PASSWORD: zod.string().min(1),
});

export const env = envSchema.parse(process.env);
