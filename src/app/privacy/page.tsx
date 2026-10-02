import type { Metadata } from "next";

import {
  LegalList,
  LegalPage,
  LegalPlaceholder,
  LegalSection,
  LegalSubsection,
} from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | AutoPost",
  description: "Privacy Policy for AutoPost.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="This policy explains the information AutoPost processes to authenticate users, connect social accounts, and carry out publishing requests."
    >
      <LegalSection number="01" title="Introduction">
        <p>
          This Privacy Policy explains how AutoPost collects, uses, stores, and
          protects information when you use the Service. It is a product
          template and must be reviewed against the final operating entity,
          contact details, and applicable requirements before publication.
        </p>
      </LegalSection>

      <LegalSection number="02" title="Information We Collect">
        <LegalSubsection title="Account information">
          <p>
            We may process information needed to create and authenticate your
            account, such as your email address, authentication identifiers,
            profile information, workspace membership, and account preferences.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Social account information">
          <p>
            When you connect a social account, AutoPost may store the platform
            name, platform account identifier, username or display name, avatar
            or profile metadata, authorization scopes, connection status, and
            OAuth-related information. Access and refresh credentials are
            processed server-side and stored in encrypted form; their values
            are not displayed in this policy or to the frontend.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Content and media">
          <p>
            We may process captions, uploaded images and videos, media type and
            technical metadata, post targets, scheduling information, campaign
            associations, drafts, and publishing status needed to provide the
            Service.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Usage and technical information">
          <p>
            The application may process timestamps, request and operational
            logs, error information, execution status, webhook delivery status,
            and reliability or analytics data used to operate, secure, and
            troubleshoot the Service.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection number="03" title="How We Use Information">
        <p>We use information to:</p>
        <LegalList>
          <li>authenticate users and maintain sessions;</li>
          <li>connect and manage social accounts at your request;</li>
          <li>store, validate, schedule, and publish your content;</li>
          <li>process queued publishing and automation work;</li>
          <li>display post history, status, analytics, and notifications;</li>
          <li>maintain, secure, and troubleshoot the Service;</li>
          <li>prevent abuse and protect users, systems, and third parties; and</li>
          <li>improve reliability and the operation of available features.</li>
        </LegalList>
      </LegalSection>

      <LegalSection number="04" title="How We Share Information">
        <p>
          We may share relevant information with the social platforms you
          select, infrastructure and service providers required to operate
          AutoPost, and legal authorities when disclosure is required by law or
          needed to protect rights, safety, or the Service.
        </p>
        <p>
          When you choose to publish to a platform, relevant content and the
          authorization needed to perform that request may be transmitted to
          that platform. The platform&apos;s own privacy policy, terms, API rules,
          and data practices also apply.
        </p>
      </LegalSection>

      <LegalSection number="05" title="Third-Party Services">
        <p>
          AutoPost relies on third-party services that may include Supabase for
          authentication, database, and storage; Redis infrastructure for
          queued processing; hosting and infrastructure providers selected for
          the deployment; and the social platforms you connect. The repository
          does not establish a single hosting provider, so the applicable
          deployment provider should be added during legal review.
        </p>
      </LegalSection>

      <LegalSection number="06" title="OAuth and Social Access">
        <p>
          AutoPost uses OAuth to connect social accounts. You provide the
          authorization through the applicable platform, and AutoPost uses the
          resulting permissions to perform actions you request. OAuth access
          credentials are processed on the server and are not intended to be
          shown in the frontend, queue payloads, or application logs.
        </p>
        <p>
          You can disconnect an account in the application where that control
          is available. You may also revoke authorization through the relevant
          social platform. Revoking authorization can stop scheduled or future
          publishing to that account.
        </p>
      </LegalSection>

      <LegalSection number="07" title="Data Storage and Security">
        <p>
          Uploaded media is stored in private application storage. Social
          credentials are stored in encrypted form on the server. We implement
          reasonable technical and organizational measures to protect
          information against unauthorized access, loss, misuse, or alteration.
          No method of storage or transmission can be guaranteed to be
          completely secure.
        </p>
      </LegalSection>

      <LegalSection number="08" title="Data Retention">
        <p>
          We retain information for as long as reasonably necessary to provide
          the Service, comply with applicable obligations, resolve disputes, and
          enforce our agreements. Actual retention may vary by data type,
          account state, operational need, and deletion or cleanup behavior.
        </p>
      </LegalSection>

      <LegalSection number="09" title="Your Rights and Choices">
        <p>
          Depending on where you live and applicable law, you may have rights to
          access, correct, delete, or request information about your personal
          information. You may also disconnect social accounts in AutoPost and
          revoke third-party authorization through the relevant platform.
        </p>
        <p>
          To ask a privacy question or make a request, contact:
          {" "}
          <LegalPlaceholder>[LEGAL CONTACT EMAIL]</LegalPlaceholder>. We may
          need to verify your identity before completing a request.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Cookies and Similar Technologies">
        <p>
          The current application uses authentication and session cookies so
          users can sign in and remain authenticated. It may also use temporary
          cookies required for OAuth state and secure request flows. This policy
          does not describe advertising or tracking cookies because those are not
          established by the current repository implementation.
        </p>
      </LegalSection>

      <LegalSection number="11" title="Children&apos;s Privacy">
        <p>
          The Service is not intended for children. If you believe a child has
          provided personal information through the Service, contact us so the
          situation can be reviewed.
        </p>
      </LegalSection>

      <LegalSection number="12" title="International Data Transfers">
        <p>
          AutoPost, its infrastructure providers, and the social platforms you
          choose may process information in countries different from your own.
          Where applicable, transfers should be handled using the safeguards
          required by the relevant law and the terms of the applicable provider.
        </p>
      </LegalSection>

      <LegalSection number="13" title="Changes to This Privacy Policy">
        <p>
          We may update this Privacy Policy as the Service, our practices, or
          applicable requirements change. The Last updated date will change when
          the policy is updated. We encourage you to review this page
          periodically.
        </p>
      </LegalSection>

      <LegalSection number="14" title="Contact">
        <p>
          Privacy questions and requests should be sent to:
          {" "}
          <LegalPlaceholder>[LEGAL CONTACT EMAIL]</LegalPlaceholder>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
