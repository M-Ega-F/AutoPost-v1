import type { Metadata } from "next";

import {
  LegalList,
  LegalPage,
  LegalPlaceholder,
  LegalSection,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | AutoPost",
  description: "Terms of Service for AutoPost.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="These terms describe the rules for using AutoPost to connect social accounts, prepare content, and manage publishing activity."
    >
      <LegalSection number="01" title="Acceptance of Terms">
        <p>
          By accessing or using AutoPost, you agree to these Terms of Service.
          If you do not agree, do not use the Service. If you use AutoPost on
          behalf of an organization, you confirm that you have authority to
          accept these terms for that organization.
        </p>
      </LegalSection>

      <LegalSection number="02" title="Description of Service">
        <p>
          AutoPost is a multi-social publishing service that helps you connect
          social accounts, create content, upload media, choose one or more
          social accounts, publish now, schedule publishing, and view post and
          publishing status. The Service may also include workspace, campaign,
          automation, review, analytics, notification, and webhook features
          available in the application.
        </p>
      </LegalSection>

      <LegalSection number="03" title="Account Registration">
        <p>
          You must provide information required to create and use an account.
          You are responsible for keeping your login credentials secure and for
          activity performed through your account. Notify us promptly if you
          believe your account or a connected social account has been used
          without authorization.
        </p>
      </LegalSection>

      <LegalSection
        number="04"
        title="Social Media Accounts and Third-Party Services"
      >
        <p>
          AutoPost integrates with third-party services including Instagram,
          Facebook, TikTok, Threads, LinkedIn, and X. When you connect a social
          account, you authorize AutoPost to use the permissions granted by the
          applicable OAuth flow to perform actions you request.
        </p>
        <p>
          You remain responsible for your social accounts and for complying
          with each platform&apos;s terms, API policies, content rules, and other
          requirements. Third-party APIs may change, become unavailable,
          impose rate limits, revoke permissions, suspend accounts, or change
          their review and eligibility requirements. These events may affect
          AutoPost functionality.
        </p>
      </LegalSection>

      <LegalSection number="05" title="User Content">
        <p>
          You retain ownership of content you upload, create, or submit through
          AutoPost. You are responsible for having all rights, permissions, and
          licenses needed to use and publish that content, including captions,
          images, videos, and other materials.
        </p>
        <p>
          You grant AutoPost the limited permission needed to store, process,
          transmit, and publish your content as necessary to provide the
          Service and carry out your instructions.
        </p>
      </LegalSection>

      <LegalSection number="06" title="Prohibited Use">
        <p>You may not use AutoPost to:</p>
        <LegalList>
          <li>violate applicable law or another person&apos;s rights;</li>
          <li>send spam, malware, fraud, or deceptive content;</li>
          <li>impersonate another person or organization;</li>
          <li>harass, threaten, or abuse others;</li>
          <li>publish content without the necessary rights or authorization;</li>
          <li>abuse, overload, or bypass limits imposed by a social platform;</li>
          <li>attempt to bypass AutoPost security or access another user&apos;s data; or</li>
          <li>interfere with the operation or availability of the Service.</li>
        </LegalList>
      </LegalSection>

      <LegalSection number="07" title="Publishing and Scheduling">
        <p>
          Publishing and scheduling depend on AutoPost availability, your
          account status, the content you provide, and third-party APIs. A
          scheduled post is a request to attempt publication at the selected
          time, not an absolute guarantee that publication will succeed.
        </p>
        <p>
          You are responsible for ensuring that your content and connected
          accounts remain eligible when a scheduled or queued post is processed.
        </p>
      </LegalSection>

      <LegalSection number="08" title="Fees and Billing">
        <p>
          Certain features or future versions of the Service may be subject to
          fees. Any applicable fees will be presented to you before you are
          charged. No pricing or billing commitment is created by these terms
          where no fee has been presented to you.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Availability">
        <p>
          The Service may be affected by maintenance, downtime, network issues,
          infrastructure failures, third-party outages, API changes, rate
          limits, or other events outside our reasonable control. We do not
          promise that the Service will be uninterrupted or error-free.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Intellectual Property">
        <p>
          AutoPost and the Service, including their software, interfaces,
          documentation, and proprietary components, remain the property of the
          Service operator or its licensors. These terms do not transfer that
          ownership to you.
        </p>
        <p>
          Your content remains yours, or belongs to the party that gave you the
          right to use it, subject to the limited permissions needed to operate
          the Service.
        </p>
      </LegalSection>

      <LegalSection number="11" title="Termination and Suspension">
        <p>
          You may stop using AutoPost or disconnect a social account at any
          time. Access may be suspended or terminated for abuse, a violation of
          these terms, security concerns, or a restriction affecting a
          connected third-party account. A third-party platform restriction may
          also prevent some features from working even if your AutoPost account
          remains open.
        </p>
      </LegalSection>

      <LegalSection number="12" title="Disclaimer">
        <p>
          AutoPost is provided on an as-available and as-is basis to the extent
          permitted by applicable law. We do not guarantee that every post will
          publish successfully, that a social API will remain available, that a
          scheduled post will be published, or that analytics and status data
          will always be complete or accurate.
        </p>
      </LegalSection>

      <LegalSection number="13" title="Limitation of Liability">
        <p>
          To the extent permitted by applicable law, the Service operator will
          not be responsible for indirect, incidental, special, consequential,
          exemplary, or loss-of-profit damages arising from or related to use
          of the Service, third-party services, content, or failed or delayed
          publication. Nothing in these terms limits liability that cannot be
          limited under applicable law.
        </p>
      </LegalSection>

      <LegalSection number="14" title="Changes to These Terms">
        <p>
          We may update these Terms of Service as the Service changes or as
          needed for operational, security, or legal reasons. The Last updated
          date will change when the document is updated. Continued use of the
          Service after an update means you accept the updated terms to the
          extent permitted by applicable law.
        </p>
      </LegalSection>

      <LegalSection number="15" title="Governing Law">
        <p>
          The governing law and venue for these terms must be completed before
          publication: <LegalPlaceholder>[APPLICABLE JURISDICTION]</LegalPlaceholder>.
        </p>
      </LegalSection>

      <LegalSection number="16" title="Contact">
        <p>
          Questions about these Terms of Service may be directed to:
          {" "}
          <LegalPlaceholder>[LEGAL CONTACT EMAIL]</LegalPlaceholder>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
