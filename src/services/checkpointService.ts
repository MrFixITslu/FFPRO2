import type { AppState } from './vaultService';
export interface Checkpoint { data: AppState; base: AppState | null; version: number }
async function open() {
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('ffpro-checkpoints',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('states');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export const checkpointService = {
  async get(userId:string):Promise<Checkpoint|null> {
    const db=await open();try{return await new Promise((resolve,reject)=>{
      const request=db.transaction('states').objectStore('states').get(userId);
      request.onsuccess=()=>resolve(request.result || null);request.onerror=()=>reject(request.error);
    });}finally{db.close();}
  },
  async save(userId:string,value:Checkpoint) {
    const db=await open();try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('states','readwrite');tx.objectStore('states').put(value,userId);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });}finally{db.close();}
  },
  async clear(userId:string) {
    const db=await open();try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('states','readwrite');tx.objectStore('states').delete(userId);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
  }
};
