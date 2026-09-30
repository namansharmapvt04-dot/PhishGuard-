"""
Seed ChromaDB with real-world phishing pattern templates.
Run once before starting the app:
  python scripts/seed_chromadb.py

Patterns are derived from public phishing awareness datasets.
No actual malicious infrastructure is referenced.
"""
import sys
import os

# Add backend root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.rag.vectorstore import upsert_patterns, collection_count

PHISHING_PATTERNS = [
    # ── Credential harvesting ────────────────────────────────────────────────
    {
        "id": "ph_001",
        "text": "Subject: [URGENT] Your account password expires in 24 hours\n\nDear {first_name},\n\nOur IT Security team has detected that your corporate account password is set to expire in the next 24 hours. Failure to update your password will result in account lockout.\n\nClick here to update your password immediately: [LINK]\n\nIT Security Team",
        "metadata": {"vector": "credential_harvest", "urgency": "high", "persona": "IT Security"},
    },
    {
        "id": "ph_002",
        "text": "Subject: Action Required: Multi-Factor Authentication Update\n\nHello {first_name},\n\nAs part of our ongoing security upgrade, all employees must re-enrol in Multi-Factor Authentication by Friday. Accounts not re-enrolled will be suspended pending manual review.\n\nComplete your MFA enrolment: [LINK]\n\nCorporate IT",
        "metadata": {"vector": "credential_harvest", "urgency": "medium", "persona": "Corporate IT"},
    },
    {
        "id": "ph_003",
        "text": "Subject: Unusual sign-in activity detected on your account\n\nWe noticed a sign-in attempt from an unrecognised device in [City, Country] at [Time]. If this was you, no action is needed.\n\nIf you don't recognise this activity, secure your account immediately: [LINK]\n\nSecurity Operations Center",
        "metadata": {"vector": "credential_harvest", "urgency": "high", "persona": "Security Operations"},
    },
    # ── Finance / CFO fraud ──────────────────────────────────────────────────
    {
        "id": "ph_004",
        "text": "Subject: Confidential — Wire transfer authorisation required\n\nHi {first_name},\n\nI need you to process an urgent wire transfer of $47,500 to our new vendor account. This is time-sensitive and must be completed before close of business today. Please keep this confidential until the deal closes.\n\nI'm in a board meeting and can't be reached by phone. Process as soon as possible.\n\n{manager_name}\nCFO",
        "metadata": {"vector": "cfo_fraud", "urgency": "high", "persona": "CFO"},
    },
    {
        "id": "ph_005",
        "text": "Subject: Invoice #INV-2847 Payment Required\n\nDear Accounts Team,\n\nPlease find attached invoice #INV-2847 for $23,400. Payment is due within 48 hours per our contract terms. Our banking details have changed — please use the new account information in the attached PDF.\n\nFor queries, contact accounts@[spoofed-vendor].com",
        "metadata": {"vector": "invoice_fraud", "urgency": "medium", "persona": "Vendor"},
    },
    # ── HR / Payroll ─────────────────────────────────────────────────────────
    {
        "id": "ph_006",
        "text": "Subject: Important: Update your direct deposit information\n\nDear {first_name},\n\nHR has initiated our annual banking information verification process. All employees must verify or update their direct deposit details by [Date] to ensure timely payroll processing.\n\nUpdate your banking information here: [LINK]\n\nHuman Resources Department",
        "metadata": {"vector": "payroll_fraud", "urgency": "medium", "persona": "HR"},
    },
    {
        "id": "ph_007",
        "text": "Subject: Your 2024 W-2 / Tax Document is Ready\n\nHello {first_name},\n\nYour 2024 tax documents are now available in the employee portal. You must verify your identity to access them.\n\nAccess your tax documents: [LINK]\n\nPayroll Services",
        "metadata": {"vector": "payroll_fraud", "urgency": "low", "persona": "Payroll"},
    },
    # ── IT / Software ────────────────────────────────────────────────────────
    {
        "id": "ph_008",
        "text": "Subject: Microsoft 365 — Your storage quota has been exceeded\n\nDear {first_name},\n\nYour Microsoft 365 mailbox is currently at 98% capacity. Emails are being delayed or bounced. Click below to increase your storage allocation immediately.\n\nExpand storage now: [LINK]\n\nMicrosoft 365 Admin",
        "metadata": {"vector": "credential_harvest", "urgency": "medium", "persona": "Microsoft 365"},
    },
    {
        "id": "ph_009",
        "text": "Subject: DocuSign: Please review and sign your NDA\n\nPlease review and sign the Non-Disclosure Agreement sent by {manager_name}.\n\nREVIEW DOCUMENT: [LINK]\n\nThis link expires in 24 hours.\n\nDocuSign Electronic Signature Service",
        "metadata": {"vector": "credential_harvest", "urgency": "medium", "persona": "DocuSign"},
    },
    {
        "id": "ph_010",
        "text": "Subject: Zoom: You have a missed meeting recording\n\nHi {first_name},\n\nYou missed a recorded Zoom meeting that {manager_name} shared with you. The recording is available for 72 hours.\n\nWatch recording: [LINK]\n\nZoom Video Communications",
        "metadata": {"vector": "credential_harvest", "urgency": "low", "persona": "Zoom"},
    },
    # ── Compliance / Legal ───────────────────────────────────────────────────
    {
        "id": "ph_011",
        "text": "Subject: Mandatory compliance training — due in 48 hours\n\nDear {first_name},\n\nOur records show you have not completed your mandatory annual security awareness training. Failure to complete this training by the deadline may result in system access suspension.\n\nComplete training now: [LINK]\n\nCompliance & Risk Team",
        "metadata": {"vector": "credential_harvest", "urgency": "high", "persona": "Compliance"},
    },
    {
        "id": "ph_012",
        "text": "Subject: Legal Notice — Required response within 24 hours\n\nDear {first_name},\n\nA legal matter requires your immediate attention. Please review the attached document and provide your response using the secure portal below. Do not discuss this with colleagues until the matter is resolved.\n\nAccess secure portal: [LINK]\n\nLegal & Compliance Department",
        "metadata": {"vector": "credential_harvest", "urgency": "high", "persona": "Legal"},
    },
    # ── Package delivery ─────────────────────────────────────────────────────
    {
        "id": "ph_013",
        "text": "Subject: Your package could not be delivered — action required\n\nDear Customer,\n\nWe attempted to deliver your package today but were unable to complete delivery. A small re-delivery fee of $2.99 is required to reschedule.\n\nPay re-delivery fee: [LINK]\n\nFedEx Delivery Services",
        "metadata": {"vector": "credential_harvest", "urgency": "low", "persona": "FedEx"},
    },
    # ── Executive impersonation ──────────────────────────────────────────────
    {
        "id": "ph_014",
        "text": "Subject: Quick favour — are you available?\n\nHi {first_name},\n\nAre you available right now? I need your help with something urgent and I'm in a meeting. Reply to this email directly.\n\nThanks\n{ceo_name}\nCEO",
        "metadata": {"vector": "executive_impersonation", "urgency": "medium", "persona": "CEO"},
    },
    {
        "id": "ph_015",
        "text": "Subject: Employee Survey — Gift card reward\n\nHi {first_name},\n\nThank you for completing last quarter's survey. As promised, you've been selected to receive a $100 Amazon gift card. Claim your reward in the next 2 hours.\n\nClaim gift card: [LINK]\n\nEmployee Rewards Team",
        "metadata": {"vector": "gift_card_scam", "urgency": "medium", "persona": "HR Rewards"},
    },
]


if __name__ == "__main__":
    print(f"Seeding {len(PHISHING_PATTERNS)} phishing patterns into ChromaDB...")
    count = upsert_patterns(PHISHING_PATTERNS)
    total = collection_count()
    print(f"✓ Seeded {count} patterns. Collection now has {total} total patterns.")
