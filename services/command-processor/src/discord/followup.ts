export type FollowupGateway = {
  send: (applicationId: string, interactionToken: string, content: string) => Promise<void>
}

const normalizeMessage = (content: string): string => {
  const trimmed = content.trim()
  if (trimmed.length <= 1900) {
    return trimmed
  }
  return `${trimmed.slice(0, 1900)}...`
}

export const createFollowupGateway = (): FollowupGateway => {
  return {
    send: async (applicationId, interactionToken, content) => {
      const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          content: normalizeMessage(content)
        })
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(
          `Discord follow-up failed: ${response.status} ${response.statusText} ${responseText.slice(0, 256)}`
        )
      }
    }
  }
}
