// src/modules/settings/integrations/AwsDetail.tsx
//
// Detail panel for the AWS connector. Combines the AWS access key/secret
// editors with the SES connection test — `email_test_ses_connection` verifies
// AWS SES reachability and therefore belongs with AWS, not the tv-api
// connector where it used to live.

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Send, Zap } from "lucide-react";
import { Button } from "../../../components/ui";
import { formatError } from "../../../lib/formatError";
import { ApiKeyDetail } from "./KeyEditor";
import { API_KEYS } from "../../../hooks/useSettings";

interface SesTestResult {
  success: boolean;
  verified_email: string | null;
  send_result: string | null;
  error: string | null;
}

function SesConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [result, setResult] = useState<SesTestResult | null>(null);

  const handleTest = async (withEmail: boolean) => {
    try {
      if (withEmail) setSending(true);
      else setTesting(true);
      setResult(null);
      const res = await invoke<SesTestResult>("email_test_ses_connection", {
        testEmail: withEmail && testEmail.trim() ? testEmail.trim() : null,
      });
      setResult(res);
    } catch (e) {
      setResult({
        success: false,
        verified_email: null,
        send_result: null,
        error: formatError(e),
      });
    } finally {
      setTesting(false);
      setSending(false);
    }
  };

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-amber-500" />
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          Test SES Connection
        </span>
      </div>
      <p className="text-sm text-zinc-500">
        Verify your AWS credentials can reach SES and optionally send a test email.
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          icon={Zap}
          onClick={() => handleTest(false)}
          disabled={testing || sending}
          loading={testing}
        >
          Verify Credentials
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="recipient@example.com"
          className="flex-1 px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
        />
        <Button
          icon={Send}
          onClick={() => handleTest(true)}
          disabled={testing || sending || !testEmail.trim()}
          loading={sending}
        >
          Send Test
        </Button>
      </div>

      {result && (
        <div
          className={`p-3 rounded-lg text-sm border space-y-1 ${
            result.success
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          }`}
        >
          <p className="font-medium">
            {result.success ? "Connection OK" : "Connection Failed"}
          </p>
          {result.verified_email && <p>Verified sender: {result.verified_email}</p>}
          {result.send_result && <p>{result.send_result}</p>}
          {result.error && <p>{result.error}</p>}
        </div>
      )}
    </div>
  );
}

export function AwsDetail() {
  return (
    <ApiKeyDetail
      title="AWS"
      description="Access key and secret used by the S3 browser and SES email delivery. Test your SES setup below after saving credentials."
      keyNames={[API_KEYS.AWS_ACCESS_KEY_ID, API_KEYS.AWS_SECRET_ACCESS_KEY]}
    >
      <SesConnectionTest />
    </ApiKeyDetail>
  );
}
