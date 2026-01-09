window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // Feedback
        const btnLabel = input.parentElement;
        const originalHtml = btnLabel.innerHTML;
        btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        btnLabel.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            // 1. Carrega dados para Cruzamento
            const { data: usersData } = await Sistema.supabase.from('usuarios').select('id, nome');
            const { data: empData } = await Sistema.supabase.from('empresas').select('id, nome, subdominio');

            // Mapas de Busca
            // Mapa ID -> ID (Para validar se o ID da planilha existe no banco)
            const mapUsuariosID = {};
            // Mapa Nome -> ID (Fallback caso a planilha não tenha ID)
            const mapUsuariosNome = {};
            
            usersData.forEach(u => {
                mapUsuariosID[u.id] = u.id;
                mapUsuariosNome[this.normalizar(u.nome)] = u.id;
            });

            const mapEmpresas = {};
            empData.forEach(e => {
                mapEmpresas[this.normalizar(e.nome)] = e.nome;
                if(e.subdominio) mapEmpresas[this.normalizar(e.subdominio)] = e.nome;
            });

            // 2. Lê Planilha
            const linhas = await Gestao.lerArquivo(file);
            const inserts = [];
            
            // Relatório de erros
            let stats = {
                total: linhas.length,
                sucesso: 0,
                semAssistente: 0,
                semData: 0
            };

            for (const row of linhas) {
                const c = {};
                // Normaliza chaves (remove espaços e caracteres especiais das colunas)
                Object.keys(row).forEach(k => c[this.normalizarKey(k)] = row[k]);

                // --- IDENTIFICAÇÃO DO USUÁRIO ---
                // 1º Tentativa: Pelo ID direto (Coluna id_assistente ou id)
                let idPlanilha = parseInt(c['idassistente'] || c['id'] || c['idusuario'] || 0);
                let usuarioId = null;

                if (idPlanilha && mapUsuariosID[idPlanilha]) {
                    usuarioId = idPlanilha;
                } else {
                    // 2º Tentativa: Pelo Nome
                    const nomeAssist = c['assistente'] || c['usuario'] || '';
                    if (nomeAssist) {
                        usuarioId = mapUsuariosNome[this.normalizar(nomeAssist)];
                    }
                }

                if (!usuarioId) {
                    stats.semAssistente++;
                    continue; // Pula linha se não identificar o usuário
                }

                // --- EMPRESA ---
                const nomeEmpresaRaw = c['empresa'] || '';
                // Tenta achar o nome oficial, se não, usa o da planilha mesmo
                const empresaOficial = mapEmpresas[this.normalizar(nomeEmpresaRaw)] || nomeEmpresaRaw;

                // --- DATA ---
                let dataRef = null;
                let horaRef = null;
                const rawDate = c['endtime'] || c['data'] || c['date'] || c['datadaauditoria'];
                
                if (rawDate) {
                    try {
                        const dObj = new Date(rawDate);
                        if (!isNaN(dObj)) {
                            dataRef = dObj.toISOString().split('T')[0];
                            horaRef = dObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                        }
                    } catch(e) {}
                }

                if (!dataRef) {
                    stats.semData++;
                    continue;
                }

                // --- MONTAGEM DO OBJETO ---
                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataRef,
                    hora: horaRef,
                    empresa: empresaOficial,
                    
                    // Colunas Mapeadas
                    nome_documento: c['docname'] || c['documento'] || '',
                    status: c['status'] || '',
                    observacao: c['apontamentosobs'] || c['obs'] || c['apontamentos'] || '',
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['%assert'] || c['assertividade'] || '',
                    auditora: c['auditora'] || '',
                    
                    quantidade: 1, 
                    fator: 1
                });
            }

            // 3. Salva no Banco (Lotes de 1000)
            if (inserts.length > 0) {
                const loteSize = 1000;
                for (let i = 0; i < inserts.length; i += loteSize) {
                    const lote = inserts.slice(i, i + loteSize);
                    const { error } = await Sistema.supabase.from('producao').insert(lote);
                    if (error) throw error;
                }
                stats.sucesso = inserts.length;

                let msg = `Processamento Finalizado!\n\n`;
                msg += `✅ Importados: ${stats.sucesso}\n`;
                if(stats.semAssistente > 0) msg += `⚠️ Ignorados (Assistente não cadastrado): ${stats.semAssistente}\n`;
                if(stats.semData > 0) msg += `⚠️ Ignorados (Sem data): ${stats.semData}\n`;
                
                alert(msg);

                if (Gestao.Assertividade) Gestao.Assertividade.carregar();
            } else {
                alert("Nenhum registro foi importado.\nVerifique se a planilha tem as colunas 'id_assistente' (ou 'Assistente') e 'end_time'.");
            }

        } catch (e) {
            console.error(e);
            alert("Erro: " + e.message);
        } finally {
            btnLabel.innerHTML = originalHtml;
            btnLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            input.value = "";
        }
    },

    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
    },

    normalizarKey: function(k) {
        // Remove tudo que não for letra ou numero
        // Ex: "nº Campos" -> "ncampos", "% Assert" -> "assert", "Apontamentos/Obs" -> "apontamentosobs"
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    }
};