import { useLocalSearchParams } from 'expo-router';
import { Placeholder } from '../../components/Placeholder';

/** Immersive: di luar grup (tabs), jadi tab bar tidak ikut tampil. */
export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Placeholder title={`Tonton: ${id ?? '—'}`} phase="fase 3 (NativePlayer + EmbedPlayer)" />;
}
