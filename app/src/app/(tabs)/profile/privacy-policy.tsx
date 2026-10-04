import { LegalDoc } from '../../../components/Legal';
import { Screen } from '../../../components/ui';

export default function PrivacyPolicy() {
  return (
    <Screen header>
      <LegalDoc doc="privacy" />
    </Screen>
  );
}
