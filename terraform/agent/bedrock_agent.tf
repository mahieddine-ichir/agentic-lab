resource "aws_iam_role" "bedrock_agent" {
  name = "${var.app_name}-bedrock-agent"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "bedrock.amazonaws.com" }
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:agent/*" }
      }
    }]
  })
}

resource "aws_iam_role_policy" "bedrock_agent" {
  name = "model-and-lambda-access"
  role = aws_iam_role.bedrock_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_agent_model_id}"
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.agent_actions.arn
      }
    ]
  })
}

resource "aws_bedrockagent_agent" "app" {
  agent_name                  = var.app_name
  foundation_model            = var.bedrock_agent_model_id
  agent_resource_role_arn     = aws_iam_role.bedrock_agent.arn
  idle_session_ttl_in_seconds = 600
  prepare_agent               = true

  instruction = <<-EOT
    Tu es un assistant IA qui traite des demandes d'adhésion à des communautés (Étudiant, Famille nombreuse, Jeune parent).

    Quand tu reçois une demande avec des documents sur S3, tu dois obligatoirement suivre cette séquence:
    1. Appeler analyze_documents pour analyser le contenu des documents
    2. Appeler evaluate_fraud pour vérifier les indicateurs de fraude
    3. Appeler check_eligibility pour vérifier que le demandeur remplit les critères
    4. Appeler make_decision pour produire la décision finale structurée

    Suis toujours cette séquence complète. Sois rigoureux et précis. Réponds en français.
  EOT
}

resource "aws_bedrockagent_agent_action_group" "document_analysis" {
  agent_id          = aws_bedrockagent_agent.app.agent_id
  agent_version     = "DRAFT"
  action_group_name = "DocumentAnalysis"
  description       = "Analyse les documents soumis par le demandeur"

  action_group_executor {
    lambda = aws_lambda_function.agent_actions.arn
  }

  function_schema {
    member_functions {
      functions {
        name        = "analyze_documents"
        description = "Analyse les documents (identité, justificatifs) soumis pour la demande d'adhésion"
        parameters {
          map_block_key = "s3_bucket"
          type          = "string"
          description   = "Nom du bucket S3 contenant les documents"
          required      = true
        }
        parameters {
          map_block_key = "s3_keys"
          type          = "string"
          description   = "Clés S3 des documents séparées par des virgules"
          required      = true
        }
        parameters {
          map_block_key = "community"
          type          = "string"
          description   = "Communauté demandée (Etudiant, Famille nombreuse, Jeune parent)"
          required      = true
        }
      }
    }
  }
}

resource "aws_bedrockagent_agent_action_group" "fraud_detection" {
  agent_id          = aws_bedrockagent_agent.app.agent_id
  agent_version     = "DRAFT"
  action_group_name = "FraudDetection"
  description       = "Détecte les indicateurs de fraude dans les documents"

  action_group_executor {
    lambda = aws_lambda_function.agent_actions.arn
  }

  function_schema {
    member_functions {
      functions {
        name        = "evaluate_fraud"
        description = "Analyse les documents pour détecter des signes de falsification ou fraude"
        parameters {
          map_block_key = "s3_bucket"
          type          = "string"
          description   = "Nom du bucket S3"
          required      = true
        }
        parameters {
          map_block_key = "s3_keys"
          type          = "string"
          description   = "Clés S3 des documents"
          required      = true
        }
        parameters {
          map_block_key = "analysis_summary"
          type          = "string"
          description   = "Résumé de l'analyse documentaire"
          required      = true
        }
      }
    }
  }
}

resource "aws_bedrockagent_agent_action_group" "eligibility" {
  agent_id          = aws_bedrockagent_agent.app.agent_id
  agent_version     = "DRAFT"
  action_group_name = "EligibilityCheck"
  description       = "Vérifie les critères d'éligibilité à la communauté"

  action_group_executor {
    lambda = aws_lambda_function.agent_actions.arn
  }

  function_schema {
    member_functions {
      functions {
        name        = "check_eligibility"
        description = "Vérifie si le demandeur remplit les critères d'éligibilité pour la communauté demandée"
        parameters {
          map_block_key = "community"
          type          = "string"
          description   = "Communauté demandée"
          required      = true
        }
        parameters {
          map_block_key = "analysis_summary"
          type          = "string"
          description   = "Résumé de l'analyse documentaire"
          required      = true
        }
      }
    }
  }
}

resource "aws_bedrockagent_agent_action_group" "decision" {
  agent_id          = aws_bedrockagent_agent.app.agent_id
  agent_version     = "DRAFT"
  action_group_name = "FinalDecision"
  description       = "Produit la décision finale d'adhésion"

  action_group_executor {
    lambda = aws_lambda_function.agent_actions.arn
  }

  function_schema {
    member_functions {
      functions {
        name        = "make_decision"
        description = "Produit la décision finale d'adhésion basée sur toutes les analyses"
        parameters {
          map_block_key = "community"
          type          = "string"
          description   = "Communauté demandée"
          required      = false
        }
        parameters {
          map_block_key = "applicant_name"
          type          = "string"
          description   = "Nom du demandeur extrait des documents"
          required      = false
        }
        parameters {
          map_block_key = "analysis_summary"
          type          = "string"
          description   = "Résumé de l'analyse documentaire"
          required      = true
        }
        parameters {
          map_block_key = "fraud_level"
          type          = "string"
          description   = "Niveau de risque fraude (low/medium/high)"
          required      = true
        }
        parameters {
          map_block_key = "eligibility_result"
          type          = "string"
          description   = "Résultat de la vérification d'éligibilité"
          required      = true
        }
      }
    }
  }
}

resource "aws_bedrockagent_agent_alias" "app" {
  agent_id         = aws_bedrockagent_agent.app.agent_id
  agent_alias_name = "live"

  routing_configuration {
    agent_version = "DRAFT"
  }

  depends_on = [
    aws_bedrockagent_agent_action_group.document_analysis,
    aws_bedrockagent_agent_action_group.fraud_detection,
    aws_bedrockagent_agent_action_group.eligibility,
    aws_bedrockagent_agent_action_group.decision,
  ]
}
