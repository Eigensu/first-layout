import type { Metadata } from "next";
import Link from "next/link";
import { LandingSubpage } from "@/components/landing/LandingSubpage";

// Carried over word for word from the retired walle-landing site.
export const metadata: Metadata = { title: "Privacy Policy | WALL-E Arena" };

export default function PrivacyPolicyPage() {
  return (
    <LandingSubpage>
      <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-text-main mb-8">Privacy Policy</h1>
        
        <p className="text-text-muted leading-relaxed mb-8">
          By accessing or using WALL-E Arena (&quot;the Service&quot;), we prioritize protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard data across both the website and mobile application platforms. It also outlines user responsibilities for the information they provide. By using our platform, you agree to the terms of this policy.
        </p>

        <div className="space-y-8 text-text-muted">
          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">1. Information We Collect</h2>
            <p className="leading-relaxed mb-4">To provide and enhance our services, we collect the following types of data:</p>
            
            <h3 className="text-xl font-medium text-text-main mb-3">1.1. User-Provided Data</h3>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li><strong className="text-text-main">Personal Information:</strong> Name, email address, contact details, and other identification data when signing up or using our services.</li>
              <li><strong className="text-text-main">Tournament Data:</strong> Team details, auction bids, and player selections submitted for participation.</li>
              <li><strong className="text-text-main">Support Requests:</strong> Information shared when contacting customer support.</li>
              <li><strong className="text-text-main">Payment Information:</strong> Details used for billing, payment processing, and resolving financial transactions securely.</li>
            </ul>

            <h3 className="text-xl font-medium text-text-main mb-3">1.2. Automatically Collected Data</h3>
            <p className="leading-relaxed mb-4">We collect the following data automatically when you use the platform:</p>
            
            <p className="text-text-main font-medium mb-2">For Website Users:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Technical details, including your browser type, IP address, device type, and operating system.</li>
              <li>Usage data, such as pages visited, time spent on the platform, and referring/exit URLs.</li>
              <li>Cookies and tracking technology to analyze user behavior and enhance user experience.</li>
            </ul>

            <p className="text-text-main font-medium mb-2">For Mobile App Users:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Device-specific data, including mobile operating system, device identifiers, and app version.</li>
              <li>Usage analytics, such as session duration, interactions, and crash reports.</li>
              <li>Permissions-based data, such as access to storage, location, or notifications, when explicitly granted.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">2. How We Use Your Data</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">2.1. Tournament Management</h3>
            <p className="leading-relaxed mb-4">
              Facilitate auctions, including managing bids, team formation, and player selections. Display and organize auction data to ensure seamless participation.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">2.2. Assisting Data Updates</h3>
            <p className="leading-relaxed mb-4">
              Create or update auction-related data upon user request to provide support and resolve difficulties.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">2.3. Customer Support</h3>
            <p className="leading-relaxed mb-4">
              Send notifications, address technical issues, and assist with platform-related queries.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">2.4. Payments and Transactions</h3>
            <p className="leading-relaxed mb-4">
              Process payments securely and address refund-related concerns when applicable.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">2.5. Performance Analytics</h3>
            <p className="leading-relaxed">
              Analyze user activity and behavior to identify areas for platform improvement. Monitor technical performance and troubleshoot system errors.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">3. User Data Accessibility and Responsibility</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">3.1. Data Accessibility</h3>
            <p className="leading-relaxed mb-4">
              We have access to user-provided data, including personal and auction-related details, to facilitate platform functionality. This data is stored securely but is not encrypted on our end, allowing us to assist with updates or auction management as requested.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">3.2. User Responsibility</h3>
            <p className="leading-relaxed">
              Users must ensure the accuracy and legality of submitted information. We do not verify or validate user-provided data beyond its intended use within the platform. Legal issues arising from user-submitted data are the sole responsibility of the user who provided it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">4. Data Sharing and Confidentiality</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">4.1. Exclusive Use of Data</h3>
            <p className="leading-relaxed mb-4">
              We do not sell, rent, or share your personal data with third parties for marketing or other commercial purposes. Data is used solely to operate and improve WALL-E Arena.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">4.2. Limited Sharing</h3>
            <p className="leading-relaxed mb-4">Your data is shared only in the following cases:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong className="text-text-main">Service Providers:</strong> Trusted third parties may access data for essential services, such as payment processing or technical support.</li>
              <li><strong className="text-text-main">Legal Compliance:</strong> Data may be disclosed to legal authorities if required by law or to protect our legal rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">5. Data Security</h2>
            <p className="leading-relaxed">
              We implement reasonable measures to protect your data from unauthorized access, alteration, or loss. However, your data is not encrypted on our end, and while we strive for robust security, no system is completely secure. Users are encouraged to take precautions when sharing sensitive data.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">6. Permissions for Mobile App Users</h2>
            <p className="leading-relaxed mb-4">
              When using the WALL-E Arena mobile app, we may request specific permissions to enhance functionality:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li><strong className="text-text-main">Storage Access:</strong> To upload or save auction-related files.</li>
              <li><strong className="text-text-main">Device Information:</strong> To troubleshoot crashes and improve app stability.</li>
              <li><strong className="text-text-main">Notifications:</strong> For important auction updates or reminders.</li>
            </ul>
            <p className="leading-relaxed">
              Note: Users can manage permissions in their device settings. Declining permissions may limit certain features.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">7. Cookies and Tracking Technologies</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">For Website Users</h3>
            <p className="leading-relaxed mb-4">
              We use cookies and similar technologies to enhance your experience and monitor platform performance. Cookies help analyze user behavior but do not store sensitive personal data. You can manage cookie preferences via your browser settings.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">For Mobile App Users</h3>
            <p className="leading-relaxed">
              We use analytics and crash reporting tools to monitor app usage and resolve issues, but these do not rely on browser-based cookies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">8. Universal Privacy Policy</h2>
            <p className="leading-relaxed">
              This Privacy Policy applies to all users of WALL-E Arena, whether accessing the service via the website or mobile app. We do not offer separate policies for specific age groups or demographics. By using our platform, you agree to the terms outlined here.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">9. Your Rights</h2>
            <p className="leading-relaxed mb-4">You have the following rights regarding your data:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li><strong className="text-text-main">Access and Update:</strong> Request access to or corrections for inaccurate or outdated information.</li>
              <li><strong className="text-text-main">Data Deletion:</strong> Request deletion of your account and associated data.</li>
              <li><strong className="text-text-main">Withdraw Consent:</strong> Revoke consent for data processing at any time without affecting prior lawful processing.</li>
            </ul>
            <p className="leading-relaxed">To exercise these rights, contact us.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">10. Changes to This Privacy Policy</h2>
            <p className="leading-relaxed">
              We reserve the right to update this Privacy Policy to reflect changes in our practices, legal requirements, or platform enhancements. The updated policy will be published on this page, and the &quot;Effective Date&quot; will be revised accordingly.
            </p>
            <div className="mt-4 p-4 bg-accent-pink-tonal rounded-2xl">
              <p>Email: <a href="mailto:walleevents@gmail.com" className="text-accent-pink-500 hover:underline">walleevents@gmail.com</a></p>
              <p className="mt-2">Or visit our <Link href="/contact" className="text-accent-pink-500 hover:underline">Contact Page</Link></p>
            </div>
          </section>
        </div>
      </div>
    </LandingSubpage>
  );
}
