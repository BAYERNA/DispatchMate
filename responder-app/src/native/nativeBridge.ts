export interface NativeFieldBridge {getAttestation():Promise<{platform:'ANDROID'|'IOS';deviceFingerprint:string;encryptionCapability:string}>;getBackgroundLocation():Promise<{latitude:number;longitude:number;accuracyM:number;recordedAt:string}>;requestRemoteWipe():Promise<{accepted:boolean}>}
declare global{interface Window{DispatchMateNative?:NativeFieldBridge}}
export const nativeBridge=()=>window.DispatchMateNative??null
