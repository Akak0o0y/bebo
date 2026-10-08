export type ConnectionStatus = { connected: boolean; saved?: boolean; error?: string; checking?: boolean };
export type ConnectionBridge = {
  status: () => Promise<ConnectionStatus>;
  connect: (key: string) => Promise<ConnectionStatus | void>;
  forgetKey?: () => Promise<ConnectionStatus>;
  onConnectionChanged?: (callback: (status: ConnectionStatus) => void) => () => void;
};
