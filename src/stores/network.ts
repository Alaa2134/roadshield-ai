import * as Network from 'expo-network';
import { create } from 'zustand';

type NetworkState = {
  online: boolean;
  known: boolean;
  set: (online: boolean) => void;
};

export const useNetwork = create<NetworkState>((set) => ({
  online: true,
  known: false,
  set: (online) => set({ online, known: true }),
}));

const isOnline = (s: Network.NetworkState) => !!s.isConnected && s.isInternetReachable !== false;

let started = false;
/** Starts listening to connectivity changes once for the whole app. */
export function startNetworkMonitor(onReconnect: () => void) {
  if (started) return;
  started = true;
  void Network.getNetworkStateAsync()
    .then((s) => useNetwork.getState().set(isOnline(s)))
    .catch(() => undefined);
  Network.addNetworkStateListener((event) => {
    const was = useNetwork.getState().online;
    const now = isOnline(event);
    useNetwork.getState().set(now);
    if (!was && now) onReconnect();
  });
}
