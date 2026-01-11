window.Gestao = window.Gestao || {};
window.Gestao.Importacao = window.Gestao.Importacao || {};

Gestao.Importacao.Assertividade = {
    // Configurações de Performance
    BATCH_SIZE: 500,        // Reduzido para evitar timeout
    CONCURRENCY_LIMIT: 3,   // Máximo de requisições simultâneas

    executar: async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        // 1. UI Feedback
        const lblImportar = document.getElementById('lbl-importar');
        const originalText = lblImportar ? lblImportar.innerHTML : 'Importar';
        
        const setStatus = (msg, icon = 'fa-circle-notch fa-spin') => {
            if(lblImportar) lblImportar.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
        };

        setStatus("Lendo arquivo...");
        input.disabled = true;

        try {
            await new Promise(r => setTimeout(r, 50)); // Render UI

            // 2. Carregar Dados Auxiliares
            // Nota: Se a tabela de empresas for gigante (+20k), isso deve virar busca sob demanda
            const [resUsers, resEmpresas] = await Promise.all([
                Sistema.supabase.from('usuarios').select('id, nome'),
                Sistema.supabase.from('empresas').select('id, nome, subdominio')
            ]);

            if(resUsers.error) throw resUsers.error;
            if(resEmpresas.error) throw resEmpresas.error;

            // Indexação para O(1)
            const mapUsuariosID = new Map(resUsers.data.map(u => [u.id, u.id]));
            const mapUsuariosNome = new Map(resUsers.data.map(u => [this.normalizar(u.nome), u.id]));
            
            const mapEmpresas = new Map();
            resEmpresas.data.forEach(e => {
                const info = { id: e.id, nome: e.nome };
                mapEmpresas.set(this.normalizar(e.nome), info);
                if(e.subdominio) mapEmpresas.set(this.normalizar(e.subdominio), info);
            });

            // 3. Parse Arquivo
            const linhas = await Gestao.lerArquivo(file);
            setStatus(`Processando ${linhas.length}...`);

            const inserts = [];
            const logErros = new Set();
            let stats = { total: linhas.length, sucesso: 0, ignorados: 0 };

            // 4. Transformação de Dados
            for (const [index, row] of linhas.entries()) {
                const c = {};
                // Normaliza chaves para evitar "Company ID" vs "company_id"
                for (const k in row) c[this.normalizarKey(k)] = row[k];

                // Validação Usuário
                let usuarioId = null;
                // Tenta ID primeiro
                let rawId = c['idassistente'] || c['idusuario'] || c['id'];
                if (rawId && mapUsuariosID.has(parseInt(rawId))) {
                    usuarioId = parseInt(rawId);
                } 
                // Tenta Nome depois
                else {
                    let rawNome = c['assistente'] || c['usuario'] || c['nome'];
                    if(rawNome) usuarioId = mapUsuariosNome.get(this.normalizar(rawNome));
                }

                if (!usuarioId) {
                    const nomeParaLog = c['assistente'] || c['usuario'] || `Linha ${index+2}`;
                    logErros.add(`Usuário não encontrado: "${nomeParaLog}"`);
                    stats.ignorados++;
                    continue;
                }

                // Validação Empresa
                let empresaId = parseInt(c['companyid'] || c['company_id'] || c['idempresa'] || 0);
                let nomeEmpresa = c['empresa'] || '';

                if (!empresaId) {
                    const match = mapEmpresas.get(this.normalizar(nomeEmpresa));
                    if (match) {
                        empresaId = match.id;
                        nomeEmpresa = match.nome; // Normaliza nome oficial
                    } else {
                        empresaId = null; // Salva sem ID, mas com o nome que veio
                    }
                }

                // Validação Data (Crítico)
                const rawDate = c['endtime'] || c['datadaauditoria'] || c['data'] || c['date'];
                const dataObj = this.parseDate(rawDate);
                
                if (!dataObj) {
                    stats.ignorados++;
                    // Opcional: logar que faltou data
                    continue;
                }

                inserts.push({
                    usuario_id: usuarioId,
                    data_referencia: dataObj.data, // YYYY-MM-DD
                    hora: dataObj.hora,           // HH:MM
                    empresa: nomeEmpresa,
                    empresa_id: empresaId,
                    nome_documento: String(c['docname'] || c['documento'] || '').substring(0, 255),
                    status: c['status'] || null,
                    observacao: String(c['apontamentosobs'] || c['obs'] || '').substring(0, 500),
                    num_campos: parseInt(c['ncampos'] || c['numerocampos'] || 0),
                    qtd_ok: parseInt(c['ok'] || 0),
                    nok: parseInt(c['nok'] || 0),
                    assertividade: c['assert'] || c['assertividade'] || null,
                    auditora: c['auditora'] || null,
                    quantidade: 1,
                    fator: 1
                });
            }

            // 5. Envio em Lotes Controlados
            if (inserts.length > 0) {
                const totalLotes = Math.ceil(inserts.length / this.BATCH_SIZE);
                let lotesProcessados = 0;

                // Função auxiliar para processar um lote
                const processarLote = async (lote) => {
                    const { error } = await Sistema.supabase.from('producao').insert(lote);
                    if (error) throw error;
                    lotesProcessados++;
                    const pct = Math.round((lotesProcessados / totalLotes) * 100);
                    setStatus(`Salvando ${pct}%...`);
                };

                // Gerenciador de Concorrência
                const lotes = [];
                for (let i = 0; i < inserts.length; i += this.BATCH_SIZE) {
                    lotes.push(inserts.slice(i, i + this.BATCH_SIZE));
                }

                // Executa em chunks de promises
                for (let i = 0; i < lotes.length; i += this.CONCURRENCY_LIMIT) {
                    const chunk = lotes.slice(i, i + this.CONCURRENCY_LIMIT);
                    await Promise.all(chunk.map(l => processarLote(l)));
                }

                stats.sucesso = inserts.length;
                this.showToast(`Sucesso! ${stats.sucesso} registros importados.`, 'success');
                
                if (logErros.size > 0) {
                    this.baixarLog(logErros);
                    this.showToast(`Atenção: ${logErros.size} erros encontrados (download iniciado).`, 'warning');
                }

                // Atualiza tela
                if (Gestao.Assertividade) Gestao.Assertividade.carregar();

            } else {
                this.showToast("Nenhum dado válido encontrado na planilha.", 'error');
                if(logErros.size > 0) this.baixarLog(logErros);
            }

        } catch (e) {
            console.error(e);
            this.showToast(`Erro fatal: ${e.message}`, 'error');
        } finally {
            if(lblImportar) lblImportar.innerHTML = originalText;
            input.disabled = false;
            input.value = "";
        }
    },

    // --- Utilitários ---

    // Parser de data inteligente (Excel Serial, ISO, BR)
    parseDate: function(val) {
        if (!val) return null;
        
        let dateObj = null;

        // 1. Se for numérico (Excel Serial Date)
        if (typeof val === 'number') {
            // Ajuste básico para Excel Windows (epoch 1900)
            dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
        } 
        // 2. Se for string
        else if (typeof val === 'string') {
            const clean = val.trim();
            // Formato BR (DD/MM/YYYY)
            if (clean.match(/^\d{2}\/\d{2}\/\d{4}/)) {
                const parts = clean.split('/');
                // Mês em JS é 0-indexado
                dateObj = new Date(parts[2], parts[1] - 1, parts[0]); 
            } else {
                // Tenta ISO direto
                dateObj = new Date(clean);
            }
        } 
        // 3. Se já for objeto Date
        else if (val instanceof Date) {
            dateObj = val;
        }

        if (!dateObj || isNaN(dateObj.getTime())) return null;

        // Retorna formato ISO string "YYYY-MM-DD" e hora "HH:MM"
        // Importante: usar métodos locais para não alterar o dia por fuso
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        
        const h = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');

        return {
            data: `${y}-${m}-${d}`,
            hora: `${h}:${min}`
        };
    },

    normalizar: function(str) {
        return String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '');
    },

    normalizarKey: function(k) {
        return String(k).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    },

    baixarLog: function(setErros) {
        const conteudo = `ERROS DE IMPORTAÇÃO - ${new Date().toLocaleString()}\n\n${Array.from(setErros).join('\n')}`;
        const blob = new Blob([conteudo], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `erros_importacao_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    showToast: function(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        if(!container) return alert(msg); // Fallback

        const el = document.createElement('div');
        const colors = {
            success: 'bg-emerald-600',
            error: 'bg-rose-600',
            warning: 'bg-amber-600',
            info: 'bg-blue-600'
        };
        const colorClass = colors[type] || colors.info;

        el.className = `${colorClass} text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 min-w-[300px] animate-bounce-in text-sm font-bold`;
        el.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-times' : 'fa-info-circle'}"></i>
            <span>${msg}</span>
        `;
        
        container.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    }
};