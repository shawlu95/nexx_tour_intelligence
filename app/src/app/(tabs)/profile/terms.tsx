import { LegalDoc } from '../../../components/Legal';
import { Screen } from '../../../components/ui';

export default function Terms() {
  return (
    <Screen header>
      <LegalDoc doc="terms" />
    </Screen>
  );
}
