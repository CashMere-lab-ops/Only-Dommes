import BackHome from '../../components/BackHome';

const sections = [
  { id: 'introduction', title: '1. Introduction and scope' },
  { id: 'company', title: '2. Company identity and contact details' },
  { id: 'information', title: '3. Information we collect' },
  { id: 'accounts', title: '4. Account registration and authentication' },
  { id: 'profiles', title: '5. Creator and subscriber profiles' },
  { id: 'content', title: '6. User-generated content and uploads' },
  { id: 'messages', title: '7. Private messages and communications' },
  { id: 'age', title: '8. Age assurance' },
  { id: 'kyc', title: '9. Creator identity verification' },
  { id: 'payments', title: '10. Payments, subscriptions and payouts' },
  { id: 'moderation', title: '11. Content moderation, reporting and safety' },
  { id: 'cookies', title: '12. Cookies and similar technologies' },
  { id: 'purposes', title: '13. Purposes and lawful bases' },
  { id: 'sensitive', title: '14. Sensitive information' },
  { id: 'providers', title: '15. Service providers' },
  { id: 'transfers', title: '16. International transfers' },
  { id: 'retention', title: '17. Retention and deletion' },
  { id: 'security', title: '18. Security' },
  { id: 'rights', title: '19. Your privacy rights' },
  { id: 'closure', title: '20. Account closure' },
  { id: 'children', title: '21. Age restrictions' },
  { id: 'automated', title: '22. Automated decisions' },
  { id: 'complaints', title: '23. Complaints' },
  { id: 'changes', title: '24. Changes to this policy' },
  { id: 'contact', title: '25. Contact' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <BackHome />
      <main className="max-w-3xl mx-auto px-5 pb-16 pt-[max(7.5rem,calc(env(safe-area-inset-top)+5.5rem))]">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-4 text-zinc-300 leading-relaxed">
          This policy explains how Quinn Digital Platforms Ltd, trading as World of Dommes,
          handles personal information when you use worldofdommes.com and related services.
        </p>
        <p className="mt-2 text-sm text-zinc-500">Last updated: 11 October 2026</p>
        <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
          This page is a working privacy policy for review. It is not a statement that every
          legal requirement has been completed.
        </p>

        <nav aria-label="Privacy policy contents" className="mt-8 border border-zinc-800 rounded-2xl p-5">
          <p className="text-sm font-semibold mb-3">Contents</p>
          <ol className="space-y-2 text-sm">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-zinc-300 hover:text-pink-500 focus:text-pink-500">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10 text-zinc-300 leading-relaxed">
          <section id="introduction">
            <h2 className="text-xl font-semibold text-white mb-3">1. Introduction and scope</h2>
            <p>
              This policy applies to World of Dommes accounts, profiles, content, messages,
              payments and other features on the website. It does not apply to third-party
              websites or services that we do not control, even if you reach them from a link on our site.
            </p>
          </section>

          <section id="company">
            <h2 className="text-xl font-semibold text-white mb-3">2. Company identity and contact details</h2>
            <p>The service is operated by:</p>
            <p className="mt-3">
              Quinn Digital Platforms Ltd<br />
              Company number: 17508818<br />
              Registered office: Prime Apartments, 483 Green Lanes, London, N13 4FG, United Kingdom<br />
              Website: <a className="text-pink-500 hover:underline" href="https://worldofdommes.com/">https://worldofdommes.com/</a><br />
              Privacy email: <a className="text-pink-500 hover:underline" href="mailto:privacy@worldofdommes.com">privacy@worldofdommes.com</a>
            </p>
            <p className="mt-3">
              You can contact us at that email for privacy questions and personal data requests.
              We have not appointed a Data Protection Officer.
            </p>
          </section>

          <section id="information">
            <h2 className="text-xl font-semibold text-white mb-3">3. Information we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Account details such as email address, username, display name and account type.</li>
              <li>Authentication records needed to sign you in and recover an account.</li>
              <li>Profile information you choose to add, including a profile photo.</li>
              <li>Content you upload, including posts, stories, clips and live activity.</li>
              <li>Messages and other communications you send on the platform.</li>
              <li>Subscription, tip, purchase and payout records.</li>
              <li>Support requests and reports you submit.</li>
              <li>Technical information such as device, browser, IP address and security logs.</li>
              <li>Cookies needed to keep you signed in.</li>
            </ul>
            <p className="mt-3">
              If you use Continue with Google, Google provides your name, email address and profile picture.
            </p>
          </section>

          <section id="accounts">
            <h2 className="text-xl font-semibold text-white mb-3">4. Account registration and authentication</h2>
            <p>
              We use account details to create and maintain accounts, sign you in, recover access,
              send transactional messages, and protect accounts from unauthorised access and abuse.
              You can register with email and password, or with Google.
            </p>
          </section>

          <section id="profiles">
            <h2 className="text-xl font-semibold text-white mb-3">5. Creator and subscriber profiles</h2>
            <p>
              Some profile information, such as username, display name, photo and public posts, can be
              visible to other users. Private account information, such as your email address and
              payment records, is not shown on your public profile. Creators control what they post,
              subject to platform rules.
            </p>
          </section>

          <section id="content">
            <h2 className="text-xl font-semibold text-white mb-3">6. User-generated content and uploads</h2>
            <p>
              Images, videos and other uploads are stored and delivered so the service can show them
              to the people who are allowed to see them. Video may be processed by our video provider.
              We may also process content for security, moderation, rights enforcement and legal compliance.
              Closing an account does not mean every copy is deleted at once.
            </p>
          </section>

          <section id="messages">
            <h2 className="text-xl font-semibold text-white mb-3">7. Private messages and communications</h2>
            <p>
              Messages are stored so they can be delivered and shown in your chats. We do not promise
              that private messages are end-to-end encrypted or invisible to staff. Access may happen
              when a user reports a message, when we investigate abuse or a security issue, or when
              the law requires disclosure. We do not routinely read private messages.
            </p>
          </section>

          <section id="age">
            <h2 className="text-xl font-semibold text-white mb-3">8. Age assurance</h2>
            <p>
              World of Dommes is for adults aged 18 and over. A dedicated age-verification provider
              is not yet in use. When age checks are added, this policy will be updated to name the
              provider, the information sent to them, the result we keep, and how long it is kept.
            </p>
          </section>

          <section id="kyc">
            <h2 className="text-xl font-semibold text-white mb-3">9. Creator identity verification</h2>
            <p>
              Creator identity checks are not yet live. When they are added, a verification provider
              may process identity information and return a result to us. We will update this policy
              before that starts, including what we receive and what we retain.
            </p>
          </section>

          <section id="payments">
            <h2 className="text-xl font-semibold text-white mb-3">10. Payments, subscriptions and payouts</h2>
            <p>
              Payments are processed by a payment provider. We keep transaction records such as
              subscriptions, tips, purchases, refunds, creator balances and payout details needed to
              run the service and meet legal record-keeping duties. We do not store complete card numbers.
              Card details are handled by the payment provider.
            </p>
          </section>

          <section id="moderation">
            <h2 className="text-xl font-semibold text-white mb-3">11. Content moderation, reporting and safety</h2>
            <p>
              We may use personal information to investigate reports, enforce platform rules, detect
              fraud and abuse, handle security incidents, protect users, and meet legal duties.
              Moderation records may be kept after a report is closed where that is needed for safety
              or legal reasons.
            </p>
          </section>

          <section id="cookies">
            <h2 className="text-xl font-semibold text-white mb-3">12. Cookies and similar technologies</h2>
            <p>
              We use cookies that are needed to keep you signed in and to protect the session.
              We do not currently use a separate advertising or analytics tracker on this policy.
              A dedicated cookie policy and preference controls are still to be added.
            </p>
          </section>

          <section id="purposes">
            <h2 className="text-xl font-semibold text-white mb-3">13. Purposes and lawful bases</h2>
            <p>We process personal information to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Provide the account and features you ask for, as part of our contract with you.</li>
              <li>Take payments, keep financial records, and meet legal duties.</li>
              <li>Keep the service secure and enforce our rules, based on our legitimate interests.</li>
              <li>Use optional features where we ask for consent.</li>
            </ul>
          </section>

          <section id="sensitive">
            <h2 className="text-xl font-semibold text-white mb-3">14. Sensitive information</h2>
            <p>
              Because this is an adult creator platform, some content or profile information may relate
              to a person’s sex life. We only process that information to provide the service you choose
              to use, to keep the platform safe, and where the law allows it. Identity-document checks
              are not live. If they are added, we will set out the extra safeguards before they start.
            </p>
          </section>

          <section id="providers">
            <h2 className="text-xl font-semibold text-white mb-3">15. Service providers</h2>
            <p>We use service providers to run the platform, including:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Supabase, for accounts, database and file storage.</li>
              <li>Google, if you choose Continue with Google.</li>
              <li>A payment provider, for card payments and related records.</li>
              <li>A video provider, for video upload and playback.</li>
              <li>Our website host, to serve the site.</li>
            </ul>
            <p className="mt-3">
              These providers process information for us so the service can work. They are not allowed
              to use it for their own unrelated purposes.
            </p>
          </section>

          <section id="transfers">
            <h2 className="text-xl font-semibold text-white mb-3">16. International transfers</h2>
            <p>
              World of Dommes is aimed at an international audience. Some providers may process
              information outside the United Kingdom. Where that happens, we rely on the safeguards
              required by UK data protection law, such as adequacy regulations or standard contractual
              clauses, where they apply. We do not claim that all information stays in the United Kingdom.
            </p>
          </section>

          <section id="retention">
            <h2 className="text-xl font-semibold text-white mb-3">17. Retention and deletion</h2>
            <p>
              We keep information for as long as it is needed for the purpose it was collected, and
              for longer where the law, financial records, safety, or security require it. We do not
              promise that every record is deleted the moment an account is closed. Exact retention
              periods are still being set and will be added after legal review.
            </p>
          </section>

          <section id="security">
            <h2 className="text-xl font-semibold text-white mb-3">18. Security</h2>
            <p>
              We use access controls, encrypted connections, and provider security features to protect
              personal information. No online service can be guaranteed completely secure.
            </p>
          </section>

          <section id="rights">
            <h2 className="text-xl font-semibold text-white mb-3">19. Your privacy rights</h2>
            <p>Depending on your situation, you may have the right to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Access your personal information.</li>
              <li>Correct inaccurate information.</li>
              <li>Ask for erasure.</li>
              <li>Restrict or object to certain processing.</li>
              <li>Ask for a copy in a portable format.</li>
              <li>Withdraw consent where consent is the basis.</li>
              <li>Complain to a data protection authority.</li>
            </ul>
            <p className="mt-3">
              These rights are not absolute. Email{' '}
              <a className="text-pink-500 hover:underline" href="mailto:privacy@worldofdommes.com">privacy@worldofdommes.com</a>{' '}
              to make a request.
            </p>
          </section>

          <section id="closure">
            <h2 className="text-xl font-semibold text-white mb-3">20. Account closure</h2>
            <p>
              Closing an account is not the same as deleting every related record. Some information
              may be kept where the law, financial records, safety, or security require it. To ask
              for deletion, email privacy@worldofdommes.com.
            </p>
          </section>

          <section id="children">
            <h2 className="text-xl font-semibold text-white mb-3">21. Age restrictions</h2>
            <p>
              The platform is for people aged 18 and over. We do not knowingly provide accounts to
              children. A dedicated age-verification system is not yet live.
            </p>
          </section>

          <section id="automated">
            <h2 className="text-xl font-semibold text-white mb-3">22. Automated decisions</h2>
            <p>
              We do not currently make solely automated decisions that produce legal or similarly
              significant effects. If fraud checks, verification, or moderation tools of that kind
              are added, this policy will be updated.
            </p>
          </section>

          <section id="complaints">
            <h2 className="text-xl font-semibold text-white mb-3">23. Complaints</h2>
            <p>
              Contact us first at privacy@worldofdommes.com. You can also complain to the UK
              Information Commissioner’s Office at ico.org.uk. If you are outside the UK, a local
              authority may also apply.
            </p>
          </section>

          <section id="changes">
            <h2 className="text-xl font-semibold text-white mb-3">24. Changes to this policy</h2>
            <p>
              We may update this policy. The date at the top will change when we do. If a change is
              important, we will take reasonable steps to draw attention to it on the site.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-xl font-semibold text-white mb-3">25. Contact</h2>
            <p>
              Quinn Digital Platforms Ltd<br />
              Trading as World of Dommes<br />
              Registered office:<br />
              Prime Apartments<br />
              483 Green Lanes<br />
              London<br />
              N13 4FG<br />
              United Kingdom<br />
              Company number: 17508818<br />
              Website: <a className="text-pink-500 hover:underline" href="https://worldofdommes.com/">https://worldofdommes.com/</a><br />
              Privacy enquiries:{' '}
              <a className="text-pink-500 hover:underline" href="mailto:privacy@worldofdommes.com">privacy@worldofdommes.com</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
