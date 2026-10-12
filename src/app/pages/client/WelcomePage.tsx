import { Box, config } from 'folds';
import { Page, PageHero, PageHeroSection } from '$components/page';
import LogoSVG from '$public/res/svg/logo.svg';

export function WelcomePage() {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400, paddingBottom: config.space.S700 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          <PageHero
            icon={<img width="70" height="70" src={LogoSVG} alt="Maretrix logo" />}
            title="Welcome to Maretrix"
            subTitle="daiwascarlet's Matrix client."
          >
          </PageHero>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
