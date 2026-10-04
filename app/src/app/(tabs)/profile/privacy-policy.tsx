import { LegalDoc } from '../../../components/Legal';
import { BackLink, Screen, TabHeader } from '../../../components/ui';

export default function PrivacyPolicy() {
  return (
    <Screen tab>
      <TabHeader />
      <BackLink />
      <LegalDoc doc="privacy" />
    </Screen>
  );
}
