import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HelloClockwork } from "../target/types/hello_clockwork";
import { ClockworkProvider } from "@clockwork-xyz/sdk";
import { expect } from "chai";
import { spawn } from "child_process";
import { TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const print_address = (label, address) => {
  console.log(`${label}: https://explorer.solana.com/address/${address}?cluster=devnet`);
}

const print_tx = (label, address) => {
  console.log(`${label}: https://explorer.solana.com/tx/${address}?cluster=devnet`);
}

const print_thread = async (clockworkProvider, address) => {
  const threadAccount = await clockworkProvider.getThreadAccount(address);
  console.log("\nThread: ", threadAccount, "\n");
  print_address("🧵 Thread", address);
  console.log("\n")
}

const stream_program_logs = (programId) => {
  const cmd = spawn("solana", ["logs", "-u", "devnet", programId.toString()]);
  cmd.stdout.on("data", data => {
    console.log(`Program Logs: ${data}`);
  });
}

describe("hello_clockwork", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.HelloClockwork as Program<HelloClockwork>;
  const { connection } = program.provider;
  const provider = anchor.AnchorProvider.local();
  const wallet = provider.wallet;
  const clockworkProvider = ClockworkProvider.fromAnchorProvider(provider);

  it("It says hello", async () => {
    const tx = await program.methods.hello("world").rpc();
    print_tx("🖊️  Hello", tx);
  });

  it("It runs every 10 seconds", async () => {
    // 1️⃣  Prepare an instruction to be automated.
    const targetIx = await program.methods.hello("world").accounts({}).instruction();

    // 2️⃣  Define a trigger condition for the thread.
    const trigger = {
      cron: {
        schedule: "*/1 * * * * * *",
        skippable: true,
      },
    }

    // 3️⃣  Create the thread.
    try {
      const threadId = "hello_" + new Date().getTime() / 1000;
      const ix = await clockworkProvider.threadCreate(
        wallet.publicKey, // authority
        threadId,               // id
        [targetIx],             // instructions to execute
        trigger,                // trigger condition
        anchor.web3.LAMPORTS_PER_SOL, // pre-fund amount
      );
      const tx = new anchor.web3.Transaction().add(ix);
      let { lastValidBlockHeight, blockhash } = await connection.getLatestBlockhash('finalized');
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [ix]
      }).compileToV0Message();
      const transaction = new VersionedTransaction(messageV0);
      wallet.signTransaction(transaction);
      const txid = await connection.sendTransaction(transaction, { maxRetries: 5 });
      print_tx("🧵 Thread tx creation:", txid);
    } catch (e) {
      // ❌
      // 'Program log: Instruction: ThreadCreate',
      // 'Program 11111111111111111111111111111111 invoke [2]',
      // 'Allocate: account Address { address: ..., base: None } already in use'
      //
      // -> If you encounter this error, the thread address you are trying to use is already in use.
      //    You can change the threadId, to generate a new account address.
      // -> OR update the thread with a ThreadUpdate instruction (more on this in future guide)
      console.error(e);
      expect.fail(e);
    }
  });
});
