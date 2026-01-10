import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isAddress, type Address } from '@solana/kit';

// Ensure BigInt can be serialized to JSON
// @ts-ignore
BigInt.prototype.toJSON = function () { return this.toString(); };

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { address } = req.query;

    if (!address) {
        res.status(400).json({ error: 'Address parameter is required' });
        return;
    }

    if (Array.isArray(address)) {
        res.status(400).json({ error: 'Address parameter must be a single value' });
        return;
    }

    if (!isAddress(address)) {
        res.status(400).json({ error: 'Invalid address parameter' });
        return;
    }

    const jupiterApiKey = process.env.JUPITER_API_KEY;
    if (!jupiterApiKey) {
        res.status(500).json({ error: 'JUPITER_API_KEY is not configured' });
        return;
    }

    try {
        const tokens = await fetchTokens(address, jupiterApiKey);
        res.status(200).json({ tokens });
    } catch (error) {
        console.error('Error fetching tokens:', error);
        res.status(500).json({ error: 'Failed to fetch tokens' });
    }
}

export type TokenData = {
    mint: Address;
    amount: bigint;
    name: string;
    symbol: string;
    icon: string | null;
    decimals: number;
    usdPriceUnit: number | null;
    usdValue: number | null;
    jupiterIsVerified: boolean;
    priceChange24hPercent: number | null;
}

type JupiterHoldingsApiResponse = {
    amount: string;
    tokens: {
        [mint: Address]: {
            amount: string;
        }[]
    }
}

type JupiterTokenSearchApiResponse = {
    id: Address;
    name: string;
    symbol: string;
    decimals: number;
    icon?: string;
    usdPrice?: number;
    isVerified?: boolean;
    stats24h?: {
        priceChange?: number;
    }
}

const SOL_MINT = 'So11111111111111111111111111111111111111112' as Address; // SOL mint address


async function fetchTokens(address: Address, jupiterApiKey: string): Promise<TokenData[]> {
    const holdingsResponse = await fetch(`https://api.jup.ag/ultra/v1/holdings/${address}`, {
        headers: {
            'x-api-key': jupiterApiKey
        }
    });
    if (!holdingsResponse.ok) {
        throw new Error(`Error fetching token holdings: ${holdingsResponse.statusText}`);
    }
    const holdingsData: JupiterHoldingsApiResponse = await holdingsResponse.json();

    const mintAndTotalBalance: { [mint: Address]: bigint } = {};
    mintAndTotalBalance['So11111111111111111111111111111111111111112' as Address] = BigInt(holdingsData.amount); // SOL mint

    for (const [mint, tokens] of Object.entries(holdingsData.tokens)) {
        const mintAddress = mint as Address;
        const balanceToAdd = tokens.reduce((sum, token) => sum + BigInt(token.amount), 0n);
        if (balanceToAdd > 0n) {
            mintAndTotalBalance[mintAddress] = (mintAndTotalBalance[mintAddress] || 0n) + balanceToAdd;
        }
    }

    // Batch to 100 tokens at a time
    const tokenData: TokenData[] = [];
    const mintsToFetch = Object.keys(mintAndTotalBalance) as Address[];

    // Jupiter API has a limit of 100 mints per request
    for (let i = 0; i < mintsToFetch.length; i += 100) {
        const mintsForBatch = mintsToFetch.slice(i, i + 100);
        const searchParams = new URLSearchParams();
        searchParams.append('query', mintsForBatch.join(','));
        const tokenResponse = await fetch(`https://api.jup.ag/ultra/v1/search?${searchParams.toString()}`, {
            headers: {
                'x-api-key': jupiterApiKey
            }
        });
        if (!tokenResponse.ok) {
            throw new Error(`Error fetching token data: ${tokenResponse.statusText}`);
        }

        const tokenDataBatch: JupiterTokenSearchApiResponse[] = await tokenResponse.json();
        tokenData.push(...tokenDataBatch.map(token => {
            const totalBalance = mintAndTotalBalance[token.id] || 0n;

            return {
                mint: token.id,
                amount: totalBalance,
                name: token.id === SOL_MINT ? 'Solana' : token.name,
                symbol: token.symbol,
                icon: token.icon || null,
                decimals: token.decimals,
                usdPriceUnit: token.usdPrice || null,
                usdValue: token.usdPrice ? Number(totalBalance / (10n ** BigInt(token.decimals))) * token.usdPrice : null,
                jupiterIsVerified: token.isVerified || false,
                priceChange24hPercent: token.stats24h?.priceChange || null
            };
        }));
    }
    return tokenData;
}
