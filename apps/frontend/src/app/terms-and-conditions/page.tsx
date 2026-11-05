import type { Metadata } from "next";
import Link from "next/link";
import { LandingSubpage } from "@/components/landing/LandingSubpage";

// Carried over word for word from the retired walle-landing site.
export const metadata: Metadata = { title: "Terms & Conditions | Wall-E Arena" };

export default function TermsAndConditionsPage() {
  return (
    <LandingSubpage>
      <div className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-text-main mb-8">Terms and Conditions</h1>
        
        <p className="text-text-muted leading-relaxed mb-8">
          By accessing or using Wall-E Arena (&quot;the Service&quot;), you agree to comply with and be bound by these Terms and Conditions. Please read them carefully.
        </p>

        <div className="space-y-8 text-text-muted">
          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">1. General Terms</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">1.1 Eligibility</h3>
            <p className="leading-relaxed mb-4">
              The Service is available to users who wish to participate in creating a dream team for sports tournaments. By using the Service via the website or mobile application, you confirm that:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>You have the legal capacity to enter into binding agreements.</li>
              <li>You agree to abide by these Terms, including additional platform-specific requirements.</li>
            </ul>

            <h3 className="text-xl font-medium text-text-main mb-3">1.2 Modification of Terms</h3>
            <p className="leading-relaxed mb-4">
              Wall-E Arena reserves the right to modify, update, or change these Terms at any time. Changes will be effective immediately upon posting the revised Terms on the website or mobile application. Continued use of the Service on any platform after changes constitutes your acceptance of the new Terms.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">1.3 Account Registration</h3>
            <p className="leading-relaxed">
              To access platform features, you must register an account. You agree to provide accurate, complete, and current information during the registration process. Account details must be updated as necessary, whether accessed via the website or mobile application.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">2. Use of the Service</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">2.1 Purpose of the Service</h3>
            <p className="leading-relaxed mb-4">
              Wall-E Arena provides a platform for sports tournament participants to create their squad of best players through selection. The Service allows users to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Create squads of the best players, view and compare their entries with other players, manage data related to players and teams.</li>
              <li>Access and participate in contests through either the website or mobile application.</li>
            </ul>

            <h3 className="text-xl font-medium text-text-main mb-3">2.2 User Responsibilities</h3>
            <p className="leading-relaxed mb-4">
              You are solely responsible for the data you provide, including player information, team details, and other team-related data submitted via the website or mobile application. You agree not to provide false, misleading, or illegal information and to ensure the data you submit is compliant with applicable laws.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">2.3 Data Accuracy</h3>
            <p className="leading-relaxed mb-4">
              While we update and manage contest data as per user instructions, you are responsible for ensuring the accuracy of the information you provide. We will not be liable for any inaccuracies in user-submitted data, regardless of platform.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">2.4 Prohibited Uses</h3>
            <p className="leading-relaxed mb-4">You agree not to use the Service for any unlawful, fraudulent, or malicious activities. This includes, but is not limited to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Use the Service for unlawful, fraudulent, or malicious activities.</li>
              <li>Engage in actions that disrupt the functionality of the website or mobile application.</li>
              <li>Engaging in any activity that could harm the reputation or operations of Wall-E Arena.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">3. Contest Process</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">3.1 Making Your Own Team</h3>
            <p className="leading-relaxed mb-4">
              It is your responsibility to ensure that you create and submit your squad based on criteria selection from the squads. Before submission you also select the captain and vice captains for additional points. Ensure that you are eligible to participate in the said tournament. Tournament organisers hold the rights to disqualify any entries that do not follow eligibility criteria.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">3.2 Tournament Rules</h3>
            <p className="leading-relaxed mb-4">
              Tournaments may have specific rules outlined on both platforms, and you agree to adhere to these rules while participating. These rules will be provided at the beginning of each Tournament.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">3.3 Tournament Outcomes</h3>
            <p className="leading-relaxed">
              The winning squads are determined based on the highest points collected at the end of the game/day/tournament. Participants are ranked as per their points collected.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">4. Payment Terms</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">4.1 Payment Processing</h3>
            <p className="leading-relaxed mb-4">
              All payments made through Wall-E Arena will be processed by third-party payment processors accessible via both the website and mobile application. You agree to provide accurate billing information, and you authorize us to charge the appropriate fees related to your use of the Service.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">4.2 Fees and Charges</h3>
            <p className="leading-relaxed mb-4">
              The Service may charge fees for certain features or actions within the website or mobile application. You will be notified of any fees before committing to any action.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">4.3 Refund Policy</h3>
            <p className="leading-relaxed">
              Payments are non-refundable unless otherwise specified in the Service&apos;s specific terms. If you believe there has been an error in billing, you must contact us within a reasonable timeframe to resolve the issue.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">5. Intellectual Property</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">5.1 Ownership</h3>
            <p className="leading-relaxed mb-4">
              All content, features, and functionality available on the website and mobile application, including but not limited to text, graphics, logos, and images are protected by intellectual property laws.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">5.2 License</h3>
            <p className="leading-relaxed">
              By using the Service, you are granted a limited, non-exclusive, and non-transferable license to access and use the Service solely for its intended purpose. You may not copy, modify, distribute, or sell any content from the Service without express permission.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">6. Data Privacy and Security</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">6.1 Data Collection</h3>
            <p className="leading-relaxed mb-4">
              We collect personal and auction-related data as outlined in our Privacy Policy. By using the Service, you consent to the collection, use, and processing of your data collected through the website and mobile application.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">6.2 Platform-Specific Permissions</h3>
            <p className="leading-relaxed mb-4">
              The mobile application may request additional permissions, such as access to storage or device notifications. Declining permissions may limit certain app features.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">6.3 Data Security</h3>
            <p className="leading-relaxed">
              While we implement reasonable security measures, we cannot guarantee the absolute security of your data. You are responsible for safeguarding your account credentials and notifying us of any unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">7. Limitation of Liability</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">7.1 No Warranty</h3>
            <p className="leading-relaxed mb-4">
              The Service, accessed via the website or mobile application, is provided &quot;as is&quot; without any warranties, either express or implied, including but not limited to warranties of merchantability or fitness for a particular purpose.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">7.2 Limitation of Liability</h3>
            <p className="leading-relaxed mb-4">
              Wall-E Arena will not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including, but not limited to, loss of data, revenue, or business opportunities.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">7.3 Indemnification</h3>
            <p className="leading-relaxed">
              You agree to indemnify and hold harmless Wall-E Arena, its affiliates, and employees from any claims, damages, or losses arising from your use of the Service or any violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">8. Termination and Suspension</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">8.1 Termination by Us</h3>
            <p className="leading-relaxed mb-4">
              We may suspend or terminate your access on the website or mobile application at our discretion if you violate these Terms or if your account is deemed to be involved in any fraudulent or malicious activities.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">8.2 Termination by You</h3>
            <p className="leading-relaxed">
              You may terminate your account at any time by contacting us. Upon termination, all rights and licenses granted to you will cease immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">9. Governing Law and Dispute Resolution</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">9.1 Governing Law</h3>
            <p className="leading-relaxed">
              These Terms and Conditions are governed by and construed in accordance with the laws of Government of India.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">10. Miscellaneous</h2>
            
            <h3 className="text-xl font-medium text-text-main mb-3">10.1 Platform Consistency</h3>
            <p className="leading-relaxed mb-4">
              These Terms apply equally to both the website and mobile application.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">10.2 Entire Agreement</h3>
            <p className="leading-relaxed mb-4">
              These Terms constitute the entire agreement between you and Wall-E Arena concerning your use of the Service for both platforms.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">10.3 Severability</h3>
            <p className="leading-relaxed mb-4">
              If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.
            </p>

            <h3 className="text-xl font-medium text-text-main mb-3">10.4 Assignment</h3>
            <p className="leading-relaxed">
              Wall-E Arena may assign or transfer its rights and obligations under these Terms at any time without notice to you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-text-main mb-4">11. Contact Us</h2>
            <p className="leading-relaxed">
              If you have any questions about these Terms and Conditions, please contact us.
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
