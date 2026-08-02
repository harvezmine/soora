import { useLocalSearchParams } from 'expo-router';
import { Placeholder } from '../../components/Placeholder';

/** Immersive: di luar grup (tabs). */
export default function ReadScreen() {
  const { chapter } = useLocalSearchParams<{ chapter: string }>();
  return <Placeholder title={`Baca: ${chapter ?? '—'}`} phase="fase 4 (MangaReader)" />;
}
