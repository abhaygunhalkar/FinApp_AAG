import type { TextMessage as Text } from '../../../types';
import { bubble } from './styles';

export default function TextMessage({ message }: { message: Text }) {
  return <p className={`${bubble} whitespace-pre-wrap break-words`}>{message.text}</p>;
}
