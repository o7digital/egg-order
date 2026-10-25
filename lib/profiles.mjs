import { directory } from './directory.mjs';
import { command } from './store.mjs';
export async function profileState() {
 const raw=await command('GET','portal:profiles');
 return {raw,profiles:raw?JSON.parse(raw):directory.map(u=>({...u,active:true}))};
}
export async function profiles() {return (await profileState()).profiles;}
export const safeProfile = u => ({email:u.email,name:u.name,role:u.role,restaurant:u.restaurant,restaurants:u.restaurants||[],managers:u.managers||[],active:u.active!==false});
