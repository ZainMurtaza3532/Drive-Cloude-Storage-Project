import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import prisma from "@/lib/prisma";
import { enforceRateLimit, parseJsonBody, registrationSchema } from "@/lib/security";

export async function POST(req: Request) {
  try {
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
      return NextResponse.json(
        { error: "DATABASE_URL is not set in .env. Please configure your PostgreSQL connection string first." },
        { status: 500 }
      );
    }

    const parsed = await parseJsonBody(req, registrationSchema);
    if (parsed.response) return parsed.response;
    const { email, password } = parsed.data;
    const name = parsed.data.name || "";
    const limited = await enforceRateLimit(email, "registration");
    if (limited) return limited;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        passwordHash: hashedPassword,
        storageUsed: BigInt(0),
        storageLimit: BigInt(5368709120), // 5 GB
      },
    });

    return NextResponse.json(
      {
        message: "User registered successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    console.error("Registration failed.");
    return NextResponse.json(
      { error: "Unable to create the account. Please try again later." },
      { status: 500 }
    );
  }
}
