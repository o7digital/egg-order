import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
export function temporaryCredential() {
 const password='Egg-'+randomBytes(12).toString('base64url'),salt=randomBytes(16).toString('hex');
 return {password,record:{salt,hash:scryptSync(password,salt,64).toString('hex'),version:randomUUID(),mustChangePassword:true,expiresAt:null}};
}
export const temporaryExpired=record=>record?.mustChangePassword&&Number.isFinite(record.expiresAt)&&record.expiresAt>0&&record.expiresAt<Date.now();
