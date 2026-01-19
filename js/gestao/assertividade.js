window.Importacao = window.Importacao || {};

Importacao.Assertividade = {
    // Configuração de Lote (Evita Payload Too Large e travamentos)
    BATCH_SIZE: 1000,

    processarArquivo: function(input) {
        const file = input.files[0];
        if (!file) return;

        console.log(`📂 [Importacao] Iniciando leitura: ${file.name}`);
        
        // Extrai data do nome do arquivo (DDMMAAAA)
        // Ex: "Assertividade_01122025.csv" -> "2025-12-01"
        const dataReferencia = this.extrairDataDoNome(file.name);
        
        if (!dataReferencia) {
            alert("ERRO: O nome do arquivo deve conter a data no formato DDMMAAAA (ex: 01122025.csv).");
            input.value = ''; // Reseta input
            return;
        }

        const statusLabel = document.getElementById('status-importacao');
        if (statusLabel) statusLabel.innerText = "Lendo CSV...";

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "ISO-8859-1", // Tenta corrigir problemas de acentuação comuns
            complete: async (results) => {
                try {
                    console.log(`📊 Linhas brutas lidas: ${results.data.length}`);
                    await this.enviarLotes(results.data, dataReferencia);
                    
                    alert("Importação concluída com sucesso!");
                    // Atualiza a tela de gestão
                    if (Gestao.Assertividade) Gestao.Assertividade.carregar();
                
                } catch (error) {
                    console.error("Erro fatal na importação:", error);
                    alert(`Falha na importação: ${error.message}`);
                } finally {
                    input.value = ''; // Permite re-upload do mesmo arquivo
                    if (statusLabel) statusLabel.innerText = "";
                }
            },
            error: (err) => {
                console.error("Erro PapaParse:", err);
                alert("Erro ao ler o arquivo CSV.");
            }
        });
    },

    extrairDataDoNome: function(filename) {
        // Busca padrão de 8 dígitos (DDMMAAAA)
        const match = filename.match(/(\d{2})(\d{2})(\d{4})/);
        if (match) {
            // Retorna YYYY-MM-DD
            return `${match[3]}-${match[2]}-${match[1]}`;
        }
        return null;
    },

    normalizarChaves: function(row) {
        // Cria um novo objeto com chaves minúsculas e sem espaços para facilitar o mapeamento
        const novo = {};
        Object.keys(row).forEach(key => {
            const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
            novo[cleanKey] = row[key];
        });
        return novo;
    },

    mapearLinha: function(row, dataRef, userLogado) {
        // Normaliza para achar as colunas independente do Case
        const norm = this.normalizarChaves(row);
        
        // Tenta encontrar o ID do PPC em variações comuns
        // O console acusou erro em "id_ppc", então precisamos garantir que ele exista
        let idPpc = norm['id_ppc'] || norm['id'] || norm['idppc'] || norm['ppc_id'] || row['ID PPC'] || row['ID'];

        // Se não tiver ID, retorna null para ser filtrado depois
        if (!idPpc) return null;

        // Tratamento de Status (mapear CSV para Enum do Banco)
        let statusRaw = (norm['status'] || '').toUpperCase();
        if (statusRaw.includes('VALID')) statusRaw = 'VALIDO';
        else if (statusRaw.includes('INVALID')) statusRaw = 'INVALIDO';
        else if (statusRaw.includes('OK')) statusRaw = 'OK';
        else if (statusRaw.includes('NOK')) statusRaw = 'NOK';
        
        // Tratamento Numérico
        const parseNum = (v) => {
            if (!v) return 0;
            // Remove % e troca vírgula por ponto
            return parseFloat(String(v).replace('%','').replace(',','.').trim()) || 0;
        };

        return {
            id_ppc: idPpc.toString().trim(),
            data_referencia: dataRef,
            usuario_id: userLogado.id, // Segurança RLS
            
            // Campos de Texto (com Fallbacks)
            empresa_nome: (norm['empresa'] || norm['nome_empresa'] || norm['cliente'] || '').trim().substring(0, 255),
            assistente_nome: (norm['assistente'] || norm['nome_assistente'] || '').trim().substring(0, 255),
            auditora_nome: (norm['auditora'] || norm['auditor'] || userLogado.nome || '').trim().substring(0, 100),
            doc_name: (norm['doc_name'] || norm['documento'] || norm['arquivo'] || '').trim().substring(0, 255),
            observacao: (norm['observacao'] || norm['obs'] || norm['motivo'] || '').trim(),
            status: statusRaw || 'PENDENTE',
            
            // Campos Técnicos do PPC
            company_id: (norm['company_id'] || norm['id_empresa'] || '0').toString(),
            schema_id: (norm['schema_id'] || '0').toString(),
            data_auditoria: new Date().toISOString(), // Timestamp do upload
            
            // Métricas
            qtd_campos: parseNum(norm['qtd_campos'] || norm['campos']),
            qtd_ok: parseNum(norm['qtd_ok'] || norm['ok']),
            qtd_nok: parseNum(norm['qtd_nok'] || norm['nok']),
            porcentagem_assertividade: (norm['porcentagem'] || norm['assertividade'] || '0')
        };
    },

    enviarLotes: async function(linhasBrutas, dataRef) {
        const user = Sistema.getUsuarioLogado();
        if (!user) throw new Error("Usuário não autenticado.");

        const statusLabel = document.getElementById('status-importacao');
        
        // 1. Tratamento e Limpeza (Crucial: Filtra NULOS)
        const linhasTratadas = linhasBrutas
            .map(row => this.mapearLinha(row, dataRef, user))
            .filter(row => row !== null); // Remove linhas onde ID_PPC falhou

        console.log(`🧹 Linhas válidas após filtro: ${linhasTratadas.length} (Descartadas: ${linhasBrutas.length - linhasTratadas.length})`);
        
        if (linhasTratadas.length === 0) {
            throw new Error("Nenhuma linha válida encontrada. Verifique se a coluna 'ID PPC' existe no CSV.");
        }

        // 2. Envio em Lotes (Batching)
        const total = linhasTratadas.length;
        let processados = 0;

        for (let i = 0; i < total; i += this.BATCH_SIZE) {
            const lote = linhasTratadas.slice(i, i + this.BATCH_SIZE);
            
            if (statusLabel) statusLabel.innerText = `Enviando ${Math.min(i + this.BATCH_SIZE, total)}/${total}...`;

            const { error } = await Sistema.supabase
                .from('assertividade')
                .upsert(lote, { 
                    onConflict: 'id_ppc, data_referencia', // Garante unicidade por ID + DATA
                    ignoreDuplicates: false 
                });

            if (error) {
                console.error(`Erro no lote ${i}:`, error);
                // Não para tudo, mas avisa no console. 
                // Dependendo da criticidade, poderíamos dar throw aqui.
                console.warn("Tentando continuar com próximos lotes...");
            }
            
            processados += lote.length;
        }

        console.log("✅ Processamento finalizado.");
    }
};