import { Box, Button, Text, config, toRem } from 'folds';
import { Code, Globe, menuIcon } from '$components/icons/phosphor';
import { Page, PageHero, PageHeroSection } from '$components/page';
import LogoSVG from '$public/res/svg/logo.svg';

/**
 * Post-login landing page.
 *
 * Deliberately carries the three links the fork is obliged to expose: the project site,
 * the source (AGPL §13 — this build is a modified network service), and the terms the
 * instance is run under. Upstream Sable shows two buttons here; the same shape is kept
 * so the layout does not drift.
 */
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
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href="https://daiwascarlet.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  before={menuIcon(Globe)}
                >
                  <Text as="span" size="B400" truncate>
                    daiwascarlet.com
                  </Text>
                </Button>
                <Button
                  as="a"
                  href="https://github.com/peakbluealbum/maretrix"
                  target="_blank"
                  rel="noreferrer noopener"
                  fill="Soft"
                  before={menuIcon(Code)}
                >
                  <Text as="span" size="B400" truncate>
                    Source Code
                  </Text>
                </Button>
                <Button
                  as="a"
                  href="https://daiwascarlet.com/tos.html"
                  target="_blank"
                  rel="noreferrer noopener"
                  fill="Soft"
                  before={menuIcon(Globe)}
                >
                  <Text as="span" size="B400" truncate>
                    Terms of Service
                  </Text>
                </Button>
              </Box>
            </Box>
          </PageHero>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
