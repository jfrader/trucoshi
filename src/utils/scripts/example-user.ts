import { PrismaClient } from "@prisma/client"
import { hash } from "./sha256"

const prisma = new PrismaClient()

async function main() {
  return prisma.user.create({
    data: {
      username: "alice",
      nostrPubkey: "npub123",
      password: hash("alice"),
    },
  })
}

async function test() {
  return prisma.user.findMany({ orderBy: { id: 'asc' } })
}

main()
  .then(async (user) => {
    // console.log(user)
    return test()
  })
  .then(async (users) => {
    console.log(users)
  })
  .catch(async (e) => {
    console.error(e)
  })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(1)
  })
