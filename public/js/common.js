export const PREFIX="localjoy-"

export function peerOptions() {
  const secure = location.protocol === 'https:';
  return {
    host: location.hostname,
    port: location.port || (secure ? 443 : 80),
    path: '/peerjs',
    secure
  };
}