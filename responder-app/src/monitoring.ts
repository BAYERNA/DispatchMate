type SentrySdk=typeof import('@sentry/react')
let sdkPromise:Promise<SentrySdk>|null=null

export function initMonitoring(){
  const dsn=import.meta.env.VITE_SENTRY_DSN?.trim()
  if(!dsn)return
  sdkPromise=import('@sentry/react')
  void sdkPromise.then(Sentry=>Sentry.init({dsn,environment:import.meta.env.MODE,release:import.meta.env.VITE_APP_RELEASE||undefined,tracesSampleRate:Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE??0.05)}))
}

export function captureException(error:unknown,context?:Record<string,unknown>){if(sdkPromise)void sdkPromise.then(Sentry=>Sentry.captureException(error,{extra:context}))}
