import { useState, useEffect } from 'react';
import { useAuth } from "@/context/AuthContext";
import { loadStripe } from "@stripe/stripe-js";

// TokenContainer component
function TokenContainer() {
  const [tokenBalance, setTokenBalance] = useState('Loading...');
  const [planInfo, setPlanInfo] = useState('Loading...');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { loading, user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second
  const cacheDuration = 30000; // 30 seconds
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  const stripePromise = loadStripe(stripeKey || "");
  interface SubscriptionTiers {
    tier_name: string;
    tokens: number;
  }
  
  interface Subscription {
    subscription_tiers?: SubscriptionTiers;
    tier?: string;
  }
  
  interface CachedTokenInfo {
    token_balance: string;
    subscription?: Subscription;
  }

  const [cachedTokenInfo, setCachedTokenInfo] = useState<CachedTokenInfo | null>(null);

  // Function to fetch token information
  const fetchTokenInfo = async (forceRefresh = false) => {
    if (!forceRefresh && cachedTokenInfo && Date.now() - lastFetchTime < cacheDuration) {
      updateDisplaysFromCache();
      return cachedTokenInfo;
    }

    if (!isAuthenticated && !forceRefresh) {
      setTokenBalance('Not logged in');
      setPlanInfo('Not logged in');
      return null;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('/user/tokens', {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        setIsAuthenticated(false);
        stopTokenUpdates();
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch token information: ${response.status}`);
      }

      const data = await response.json();
      setCachedTokenInfo(data);
      setLastFetchTime(Date.now());

      setTokenBalance(`${data.token_balance} tokens`);
      setPlanInfo(
        data.subscription?.subscription_tiers
          ? `${data.subscription.subscription_tiers.tier_name} (${data.subscription.subscription_tiers.tokens} tokens/month)`
          : 'No subscription'
      );

      setRetryCount(0); // Reset retry count
      return data;
    } catch (error) {
      if (retryCount < maxRetries) {
        setRetryCount((prev) => prev + 1);
        const backoffDelay = retryDelay * Math.pow(2, retryCount);
        setTimeout(() => fetchTokenInfo(forceRefresh), backoffDelay);
      } else if (cachedTokenInfo) {
        updateDisplaysFromCache();
      } else {
        setTokenBalance('Error loading balance');
        setPlanInfo('Error loading plan');
      }
      console.error('Error fetching token information:', error);
      return null;
    }
  };

  // Update displays from cache
  const updateDisplaysFromCache = () => {
    if (cachedTokenInfo) {
      setTokenBalance(`${cachedTokenInfo.token_balance} tokens`);
      setPlanInfo(
        cachedTokenInfo.subscription?.subscription_tiers
          ? `${cachedTokenInfo.subscription.subscription_tiers.tier_name} (${cachedTokenInfo.subscription.subscription_tiers.tokens} tokens/month)`
          : 'No subscription'
      );
    }
  };

  // Start token updates
  const startTokenUpdates = async () => {
    setIsAuthenticated(true);
    setTokenBalance('Loading...');
    setPlanInfo('Loading...');

    // Initial fetch without polling
    await fetchTokenInfo(true);
  };

  // Stop token updates
  const stopTokenUpdates = () => {
    setIsAuthenticated(false);
    setTokenBalance('Not logged in');
    setPlanInfo('Not logged in');
  };

   // Handle plan selection and redirect to Stripe Checkout
   const handleSelectPlan = async (plan: string) => {
    try {
      const response = await fetch(`/api/create-checkout-session/${plan}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const session = await response.json();
      window.location.href = session.url;
   
    } catch (error) {
      console.error('Error starting checkout process:', error);
      alert('Failed to start checkout process. Please try again.');
    }
  };

  // Fetch auth status on mount
  useEffect(() => {
    if(!loading && user) {
        startTokenUpdates();
    } else {
        stopTokenUpdates();
    }
  }, [loading]);

  return (
    <div className="flex justify-between px-8 py-2 bg-black/10 rounded-3xl text-white">
      <div>
        <h3>Token Balance</h3>
        <p>{tokenBalance}</p>
      </div>
      <div>
        <h3>Your Plan</h3>
        <p>{planInfo}</p>
        <button className="px-4 py-2 bg-primary text-white rounded hover:opacity-80" onClick={() => setShowModal(true)}>
          Upgrade Plan
        </button>
      </div>

      {showModal && (
        <div className="fixed z-50 inset-0 flex items-center justify-center bg-black/50 text-black">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Choose Your Plan</h2>
            <div className="mb-4">
              <div className="p-4 border rounded mb-2">
                <h3 className="font-medium">Pro Plan</h3>
                <p>$99/month - 500 Tokens per month</p>
                <button
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
                  onClick={() => handleSelectPlan('Pro')}
                >
                  Select Pro Plan
                </button>
              </div>
              <div className="p-4 border rounded">
                <h3 className="font-medium">Agency Plan</h3>
                <p>$299/month - 1000 Tokens per month</p>
                <button
                  className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
                  onClick={() => handleSelectPlan('Agency')}
                >
                  Select Agency Plan
                </button>
              </div>
            </div>
            <button
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded"
              onClick={() => setShowModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>

    
  );
}

export default TokenContainer;