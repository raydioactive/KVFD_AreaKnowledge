import { FeatureFlags } from '../config/features';
import BaseMap from '../components/map/BaseMap';

interface HomePageProps {
  features: FeatureFlags;
}

function HomePage({ features }: HomePageProps) {
  return (
    <div className="h-screen w-screen">
      <BaseMap features={features} />
    </div>
  );
}

export default HomePage;
